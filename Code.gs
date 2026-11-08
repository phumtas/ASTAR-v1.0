/**
 * A* - the homework destroyer
 * Google Apps Script Web App Backend
 * 
 * Vibe coded by phumtas tangsakul [v1.0]
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  
  // Check user authentication via Google Session
  var userEmail = '';
  try {
    userEmail = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    Logger.log('Could not retrieve active user: ' + err);
  }
  
  template.initialUserEmail = userEmail;
  template.mode = (e && e.parameter && e.parameter.mode) ? e.parameter.mode : '';
  
  return template.evaluate()
    .setTitle('A* - the homework destroyer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Returns current authenticated Google user info.
 */
function getUserInfo() {
  try {
    var email = Session.getActiveUser().getEmail();
    return {
      email: email || '',
      isLoggedIn: !!email
    };
  } catch (e) {
    return {
      email: '',
      isLoggedIn: false,
      error: e.toString()
    };
  }
}

/**
 * Saves Gemini API key into UserProperties (isolated per Google user).
 */
function saveApiKey(apiKey) {
  var cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!cleanKey) return { success: false, error: 'Empty API key' };
  try {
    var userProperties = PropertiesService.getUserProperties();
    userProperties.setProperty('GEMINI_API_KEY', cleanKey);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Gets saved Gemini API key for this user.
 * Checks UserProperties first, then falls back to ScriptProperties.
 */
function getSavedApiKey() {
  try {
    var userProperties = PropertiesService.getUserProperties();
    var key = userProperties.getProperty('GEMINI_API_KEY');
    if (!key) {
      try {
        var scriptProperties = PropertiesService.getScriptProperties();
        key = scriptProperties.getProperty('GEMINI_API_KEY');
      } catch (scriptErr) {}
    }
    var cleanKey = (key || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
    return { success: true, apiKey: cleanKey || '' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Deletes saved API key from UserProperties.
 */
function deleteSavedApiKey() {
  try {
    var userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty('GEMINI_API_KEY');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Validates Gemini API key by listing available models.
 */
function validateApiKey(apiKey) {
  var cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!cleanKey) return { valid: false, error: 'Empty API key' };
  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(cleanKey);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = response.getResponseCode();
    if (code === 200) {
      return { valid: true };
    } else {
      var errObj = {};
      try {
        errObj = JSON.parse(response.getContentText() || '{}');
      } catch (parseErr) {}
      var msg = (errObj.error && errObj.error.message) || ('HTTP ' + code);
      return { valid: false, error: msg, code: code };
    }
  } catch (e) {
    return { valid: false, error: e.toString() };
  }
}

/**
 * Proxy call to Gemini API using Google Apps Script UrlFetchApp.
 * Solves any cross-origin restrictions when running inside Google Apps Script iframe.
 */
function callGeminiApi(apiKey, model, systemInstruction, contents) {
  try {
    var cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
    if (!cleanKey) {
      try {
        var userProperties = PropertiesService.getUserProperties();
        cleanKey = (userProperties.getProperty('GEMINI_API_KEY') || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
      } catch (uErr) {}
    }
    if (!cleanKey) {
      try {
        var scriptProperties = PropertiesService.getScriptProperties();
        cleanKey = (scriptProperties.getProperty('GEMINI_API_KEY') || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
      } catch (sErr) {}
    }

    if (!cleanKey) {
      return {
        status: 401,
        error: 'API key is missing. Please provide a valid Gemini API key.',
        data: { error: { code: 401, message: 'API key is missing.' } }
      };
    }

    // Map UI model names or passed model identifiers to standard Gemini endpoints
    var requestedModel = (model || '').trim().replace(/^models\//, '');
    if (requestedModel === 'Gemini 3.5 Flash Lite' || requestedModel === 'gemini-3.5-flash-lite') {
      requestedModel = 'gemini-3.5-flash-lite';
    } else if (requestedModel === 'Gemini 3.8 Flash' || requestedModel === 'gemini-3.8-flash') {
      requestedModel = 'gemini-3.8-flash';
    }

    // Build ordered list of candidates to try
    var candidateModels = [];
    if (requestedModel) {
      candidateModels.push(requestedModel);
    }
    
    // Add fallback models (prioritize flash-lite and flash models)
    var fallbacks = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest'
    ];
    for (var f = 0; f < fallbacks.length; f++) {
      if (candidateModels.indexOf(fallbacks[f]) === -1) {
        candidateModels.push(fallbacks[f]);
      }
    }

    var lastResponse = null;
    var lastCode = 500;
    var lastErrorMessage = '';

    var payload = {
      contents: contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    var payloadString = JSON.stringify(payload);

    for (var i = 0; i < candidateModels.length; i++) {
      var targetModel = candidateModels[i];
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' 
        + encodeURIComponent(targetModel) 
        + ':generateContent?key=' 
        + encodeURIComponent(cleanKey);

      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: payloadString,
        muteHttpExceptions: true
      });

      lastCode = response.getResponseCode();
      lastResponse = response.getContentText();

      // If 404 on v1beta, attempt v1 endpoint for this model
      if (lastCode === 404) {
        try {
          var v1Url = 'https://generativelanguage.googleapis.com/v1/models/' 
            + encodeURIComponent(targetModel) 
            + ':generateContent?key=' 
            + encodeURIComponent(cleanKey);

          var v1Payload = payload;
          if (systemInstruction) {
            var firstText = (contents && contents[0] && contents[0].parts && contents[0].parts[0] && contents[0].parts[0].text) ? contents[0].parts[0].text : '';
            v1Payload = {
              contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + firstText }] }],
              generationConfig: payload.generationConfig
            };
          }

          var v1Response = UrlFetchApp.fetch(v1Url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(v1Payload),
            muteHttpExceptions: true
          });

          if (v1Response.getResponseCode() === 200) {
            return {
              status: 200,
              data: JSON.parse(v1Response.getContentText()),
              modelUsed: targetModel
            };
          }
        } catch (v1Err) {
          Logger.log('v1 fallback error for ' + targetModel + ': ' + v1Err);
        }
      }

      if (lastCode === 200) {
        var parsedData = {};
        try {
          parsedData = JSON.parse(lastResponse);
        } catch (parseErr) {
          return {
            status: 500,
            error: 'Failed to parse Gemini response: ' + parseErr.toString()
          };
        }
        return {
          status: 200,
          data: parsedData,
          modelUsed: targetModel
        };
      }

      var errObj = {};
      try {
        errObj = JSON.parse(lastResponse || '{}');
      } catch (jsonErr) {}

      lastErrorMessage = (errObj.error && errObj.error.message) || ('HTTP ' + lastCode);

      // Check if this is an API key error (invalid key, unauthorized, bad key)
      var isKeyError = false;
      if (lastCode === 400 || lastCode === 401 || lastCode === 403) {
        var reason = '';
        if (errObj.error && errObj.error.details && errObj.error.details[0]) {
          reason = errObj.error.details[0].reason || '';
        }
        if (
          reason === 'API_KEY_INVALID' ||
          lastErrorMessage.indexOf('API key not valid') !== -1 ||
          lastErrorMessage.indexOf('API_KEY_INVALID') !== -1 ||
          lastErrorMessage.indexOf('key not valid') !== -1 ||
          lastErrorMessage.indexOf('consumer') !== -1
        ) {
          isKeyError = true;
        }
      }

      // If it's an API key error, don't bother trying other models because the key itself is rejected
      if (isKeyError) {
        return {
          status: 401,
          error: lastErrorMessage || 'It seems like the API key is NOT working',
          data: errObj
        };
      }

      // If model not found (404), unsupported/invalid argument for this model (400),
      // or temporarily rate-limited (429/503), try the next fallback model!
      Logger.log('Model ' + targetModel + ' failed with status ' + lastCode + ': ' + lastErrorMessage + '. Trying next candidate...');
    }

    // If all candidates failed
    var finalObj = {};
    try {
      finalObj = JSON.parse(lastResponse || '{}');
    } catch (finalJsonErr) {}

    return {
      status: lastCode,
      error: lastErrorMessage || ('Gemini API error (HTTP ' + lastCode + ')'),
      data: finalObj
    };
  } catch (e) {
    return {
      status: 500,
      error: e.toString()
    };
  }
}



























































































































/**
 * Save an output file directly to Google Drive.
 */
function saveFileToGoogleDrive(fileName, base64Content, mimeType) {
  try {
    var decoded = Utilities.base64Decode(base64Content);
    var blob = Utilities.newBlob(decoded, mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName);
    var file = DriveApp.createFile(blob);
    return {
      success: true,
      fileId: file.getId(),
      url: file.getUrl()
    };
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
  }
}
