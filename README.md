# Ebook Maker

A lightweight, browser-based EPUB 3 ebook creator. Write chapters in a rich-text editor, add a cover, preview the book, and export a standards-compliant `.epub` file. No backend, no build step, no account required.

**Live demo:** `https://<your-username>.github.io/ebook-maker/`

<!-- Add a screenshot: ![Ebook Maker screenshot](docs/screenshot.png) -->

## Features

- **Book metadata:** title, author, language (Bangla, English, Hindi, Arabic) and description
- **Cover image:** upload once; it is automatically resized and compressed
- **Chapter management:** add, delete and reorder chapters
- **Two writing modes (per chapter):** *HTML* (formatted text) or *Plain text* (no formatting; blank line = new paragraph)
- **Rich-text editor (HTML mode):** bold, italic, underline, text colour, headings, blockquotes, lists and text alignment; pasted formatting (colour, bold, italic) is kept, and a **</> code** button lets you view and edit the raw HTML
- **Inline images:** insert or paste images into chapters, resize them (small, medium, full), align them, and add captions and alt text; images are compressed automatically and embedded in the EPUB
- **Table of contents page:** generated automatically from chapter titles, or written manually; can be switched off
- **Live preview:** read the book as a continuous document before exporting
- **EPUB 3 export:** includes cover page, navigation document (table of contents) and package metadata
- **Autosave:** work is stored in the browser's IndexedDB, which has room for image-heavy books
- **Project backup:** save and restore the full project as a `.ebook.json` file
- **Responsive and accessible:** works on desktop and mobile, supports light and dark mode, keyboard focus is visible
- **Bangla-first UI:** interface text and default fonts are tuned for Bangla

## Getting Started

### Option 1: Use it online

Open the GitHub Pages link above.

### Option 2: Run locally

```bash
git clone https://github.com/<your-username>/ebook-maker.git
cd ebook-maker
```

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

> On the web, JSZip and the fonts load from CDNs, so an internet connection is needed. The Android app bundles JSZip and works offline with system fonts.

### Deploy to GitHub Pages

1. Push the files to a repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, select `main` and `/ (root)`, then **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/<repository-name>/`.

## Usage

1. Fill in the **book information** in the left panel (title and author are required for export).
2. Optionally upload a **cover image**.
3. Write your content, then use **+ New** to add more chapters. Use the arrow buttons to reorder them.
4. Click **Preview** to check the result.
5. Click **Create EPUB** to download the file.
6. Use **Save project** regularly to keep a backup, and **Open project** to continue later or on another device.

## Android APK (GitHub Actions)

The repository includes a workflow that wraps the web app with [Capacitor](https://capacitorjs.com/) and builds an installable Android APK in the cloud. No Android Studio is needed.

**Download the APK from a workflow run**

1. Open the **Actions** tab and select **Build Android APK**.
2. Run it with **Run workflow** (it also runs on every push to `main`).
3. When the run finishes, open it and download **ebook-maker-apk** from the **Artifacts** section. Unzip it to get `ebook-maker.apk`.

**Download the APK from a release (easier on a phone)**

Create and push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow attaches `ebook-maker.apk` to a GitHub Release, which can be opened and downloaded directly from the phone's browser.

**Install on your phone**

Open the APK, and allow *Install unknown apps* for your browser or file manager when Android asks. The APK is signed with a debug key, which is fine for personal use. Publishing to Google Play requires a release keystore.

In the Android app, **Create EPUB** and **Save project** open the system share sheet, so the file can be saved to Files or Drive, or opened in a reader.

**Open EPUB/PDF files from other apps**

The workflow adds `VIEW` intent-filters to `AndroidManifest.xml`, so the app appears in Android's *Open with* list for `.epub` and `.pdf` files (WhatsApp, Files, browser downloads). The file is read via `@capacitor/app` + `@capacitor/filesystem` and shown in the built-in reader.

## Project Structure

```
ebook-maker/
├── .github/workflows/build-apk.yml   # Builds the Android APK
├── index.html                        # Page structure and UI
├── style.css                         # Styling (light/dark themes, responsive layout)
├── app.js                            # State, editor, preview and EPUB generation
├── reader.js                         # EPUB/PDF reader + Android "Open with" handling
├── capacitor.config.json             # Android wrapper configuration
├── package.json                      # Capacitor and JSZip dependencies
└── README.md
```

## How the EPUB Is Built

The export runs entirely in the browser using [JSZip](https://stuk.github.io/jszip/):

- `mimetype` is written first and stored uncompressed, as the EPUB specification requires
- `META-INF/container.xml` points to `OEBPS/content.opf`
- `content.opf` holds metadata, the manifest and the reading order
- `nav.xhtml` provides the table of contents
- each chapter's HTML is converted to well-formed XHTML before being added
- the cover is embedded as an image with a dedicated cover page

Validate generated files with [EPUBCheck](https://www.w3.org/publishing/epubcheck/) or open them in any reader (Apple Books, Calibre, Thorium, Google Play Books).

## Browser Support

Current versions of Chrome, Edge, Firefox and Safari.

## Known Limitations

- The editor relies on `document.execCommand`, which is deprecated but still supported by all major browsers
- Autosave is per-browser and per-device; use project backups for anything important
- Very large image collections can make the project file and the exported EPUB big

## Roadmap

- [ ] PDF and HTML export
- [ ] Drag-and-drop chapter ordering
- [ ] Custom fonts and themes for the exported book
- [ ] Import from `.docx` and Markdown

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a pull request

Please keep the project dependency-free apart from JSZip, and test exported files in at least one EPUB reader.

## License

Released under the [MIT License](LICENSE). Add a `LICENSE` file to the repository before publishing (GitHub can generate one: **Add file → Create new file → name it `LICENSE`**, then choose a template).

## Acknowledgements

- [JSZip](https://stuk.github.io/jszip/) for ZIP packaging
- [Hind Siliguri](https://fonts.google.com/specimen/Hind+Siliguri) and [Noto Serif Bengali](https://fonts.google.com/noto/specimen/Noto+Serif+Bengali) via Google Fonts

## কোড মোড (HTML + CSS + JavaScript)

- অধ্যায়ের উপরে **কোড (HTML/CSS/JS)** বাটনে চাপুন। পূর্ণ HTML, `<style>` ও `<script>` সরাসরি লেখা বা পেস্ট করা যায়; নিচে লাইভ প্রিভিউ দেখা যায়।
- সাধারণ এডিটরে CSS/JS সহ কোড পেস্ট করলে অ্যাপ নিজেই কোড মোডে নেওয়ার প্রস্তাব দেয়।
- ছবি: **🖼 ছবি আপলোড** দিলে ছবি `<img src="asset:img1">` আকারে কোডে বসে। তালিকার ছবিতে ট্যাপ করলেও বসে। `https://` লিংকও চলে (EPUB করার সময় ছবি ভেতরে ঢুকিয়ে নেওয়া হয়, ওয়েবসাইট অনুমতি না দিলে বাদ যায়)।
- **📎 ফাইল আপলোড** বা ড্র্যাগ-ড্রপ: ছবি, `.html` (নতুন কোড অধ্যায়), `.txt/.md` (নতুন টেক্সট অধ্যায়), `.css/.js` (কোডে যোগ), `.json` (প্রজেক্ট খোলা)।
- রিডারে কোড অধ্যায় একটি নিরাপদ স্যান্ডবক্সে চলে (JavaScript চলে, কিন্তু অ্যাপের ডেটায় হাত দিতে পারে না)।
- EPUB-এ JavaScript চলে না। এক্সপোর্টের সময় কোড চালিয়ে ফলাফলের স্থির কপি (CSS সহ) EPUB-এ রাখা হয়। ক্লিক/সার্চের মতো ইন্টারঅ্যাকশন শুধু অ্যাপের রিডার ও প্রিভিউতে কাজ করবে।
