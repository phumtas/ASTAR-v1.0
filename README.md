# A* - the homework destroyer 🌟

A high-performance homework solving web application designed from the exact mockups in `prompt/Ui [1].pdf` and flowchart in `prompt/Algorithm[V.2].png`, built for deployment as a **Google Apps Script Web App** and runnable locally.

---

## 📋 Features Implemented

1. **Authentication & Session Routing**:
   - **`continue with google`**: Signs in with a Google account session. The **`LOGOUT`** pill button is visible in the top-right header.
   - **`continue without an account`**: Guest mode. Hovering reveals the sliding warning badge (*"⚠️ your API key will not be save..."*). As explicitly requested: **the logout button will NOT appear in the UI**.

2. **Dolan Miu's `docx` Integration**:
   - Uses the official `docx` library by Dolan Miu without modifying any files inside `docx by Dolan Miu`.
   - Incorporates document parsing, run-level editing, and document generation to add verified answers directly into homework documents (**`add ans. [edit not replace]`**).

3. **Core Algorithm Workflow (`Algorithm[V.2].png`)**:
   - **Input**: Supports `.docx` and `.pdf` homework assignments.
   - **Text Preprocessing**:
     - Strips empty text formatting (`.` replaced with 1 space, `_` replaced with 2 spaces).
     - Empty text occupying full lines converted to single linebreaks.
   - **LLM Solving**:
     - Sends cleaned problem text and original source reference to Gemini AI (`Gemini 3.5 Flash Lite` or `Gemini 3.8 Flash`).
   - **Verification Loop**:
     - An automated LLM verification step checks answer correctness and completeness.
     - Loops back to regenerate answers on failure (up to 2 retry attempts).
   - **Document Output**:
     - Formats and saves as `a-<filename>.docx` with solutions rendered in the user-configured text color (default `#000000`, e.g., `#718aff`).

4. **UI Details from Mockups**:
   - **Input Dropzone**: Interactive glowing outline on hover/drag-over, file chip listing with `.docx` (blue) and `.pdf` (red) badges, delete buttons, and horizontal scroll scaling.
   - **Token Viewer Bar**: Color-coded bar (red when missing API key, yellow/cyan when active).
   - **2-Second Confirmation Action**:
     - Green **`DO WORK ?`** button turns into **`DO WORK`** on first click, then auto-unconfirms after 2 seconds if not clicked again.
     - When running, turns into magenta **`CANCEL ?`** button with the same 2-second confirmation safety.
   - **API Key Flyout**:
     - Ring icon lights up gold when valid, flashes red on error.
     - Hovering flyout stays open while cursor is on button or box, includes link to Google AI Studio.
   - **History Tab**:
     - Uploaded files, outputted files, and saved API keys lists.
     - Anti-spam confirmation modal: **`[BACK]`** and **`[COMFIRM?]`** switch positions and remove the question mark to prevent accidental deletion clicks.
   - **Settings Tab**:
     - Output text color picker and auto-save API key toggle with reset buttons that illuminate blue when modified.
   - **About Tab Carousel**:
     - 3-slide interactive carousel with credits to Phumtas Tangsakul, Antigravity, Canva, Dolan Miu's docx library, and Phumtas's inspiring personal story.

---

## 🚀 How to Run Locally

1. Start the local preview server in your terminal:
```bash
node server.js
```
*(or run `npm start`)*

2. Open your browser to the local preview:
👉 **[http://localhost:3000](http://localhost:3000)** (or [http://127.0.0.1:3000](http://127.0.0.1:3000))

---

## 🌐 How to Deploy as a Google Apps Script Web App

1. Go to [Google Apps Script](https://script.google.com) and click **New project**.
2. Rename the project to `A* - the homework destroyer`.
3. Copy the contents of `Code.gs` into the `Code.gs` file in the script editor.
4. Click the `+` button next to **Files** and create an **HTML** file named `Index`.
5. Copy the contents of `Index.html` into `Index.html`.
6. (Optional) In **Project Settings**, enable "Show 'appsscript.json' manifest file in editor" and copy `appsscript.json`.
7. Click **Deploy** ➔ **New deployment**:
   - Select type: **Web app**.
   - Description: `A* Homework Destroyer v1.0`.
   - Execute as: **User accessing the web app** (or **Me**).
   - Who has access: **Anyone**.
8. Click **Deploy** and open the generated Web App URL!
