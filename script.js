// --- Configuration ---
const pdfUrl = 'https://files.catbox.moe/p2bx0q.pdf';
const pdfFileName = '_g8o5kwivv.pdf'; // Desired filename for download

// --- PDF.js Initialization ---
// Get the library object (assuming pdf.mjs was loaded)
const { pdfjsLib } = globalThis;
if (!pdfjsLib) {
    console.error("PDF.js library (pdf.mjs) not found. Ensure it's loaded in the HTML <head>.");
} else {
    // Set the worker source (important for performance and compatibility)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '//mozilla.github.io/pdf.js/build/pdf.worker.mjs';
}

// --- Global Variables ---
let pdfDoc = null;
let currentPageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let currentScale = 1.0; // Keep track of current scale for potential future zoom features (not implemented here)

// --- DOM Element References ---
const canvas = document.getElementById('pdf-canvas');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevButton = document.getElementById('prev-page');
const nextButton = document.getElementById('next-page');
const viewerContainer = document.querySelector('.pdf-viewer-container'); // White box container
const controlsContainer = document.querySelector('.pdf-controls'); // Controls container

// --- Core PDF Rendering Function (with DPR handling) ---
function renderPage(num) {
    if (!pdfDoc || !canvas || !viewerContainer) {
        console.error("PDF Document or required elements not ready for rendering.");
        return;
    }
    pageRendering = true;

    // Disable buttons during render
    if(prevButton) prevButton.disabled = true;
    if(nextButton) nextButton.disabled = true;

    // Get page
    pdfDoc.getPage(num).then(page => {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1; // Get Device Pixel Ratio

        // Calculate the desired display width (container width minus padding)
        const availableWidth = viewerContainer.clientWidth - (viewerContainer.style.paddingLeft ? parseFloat(viewerContainer.style.paddingLeft) * 2 : 20); // approx padding
        const desiredWidth = availableWidth > 50 ? availableWidth : 600; // Use a sensible fallback

        // Get viewport at scale 1 to determine aspect ratio
        const viewportBase = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewportBase.width; // Calculate scale needed to fit width
        const viewport = page.getViewport({ scale: scale });

        // Set CANVAS drawing buffer size based on DPR for sharpness
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        // Set CSS size to control the DISPLAY size of the canvas
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        // Scale the canvas context to account for DPR
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Clears previous transforms and sets DPR scale

        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport // Use the viewport calculated for the desired display size
        };
        const renderTask = page.render(renderContext);

        // Wait for rendering to finish
        renderTask.promise.then(() => {
          pageRendering = false;
          currentScale = scale; // Store the scale used
          if(pageNumSpan) pageNumSpan.textContent = num; // Update page number display

          // Update button states AFTER rendering
          if(prevButton) prevButton.disabled = (currentPageNum <= 1);
          if(nextButton) nextButton.disabled = (currentPageNum >= pdfDoc.numPages);

          if (pageNumPending !== null) {
            // New page rendering is pending
            renderPage(pageNumPending);
            pageNumPending = null;
          }
        }).catch(err => {
           console.error(`Error rendering page ${num}:`, err);
           pageRendering = false;
           // Re-enable buttons on error
           if(prevButton) prevButton.disabled = (currentPageNum <= 1);
           if(nextButton) nextButton.disabled = (currentPageNum >= pdfDoc.numPages);
        });
    }).catch(err => {
         console.error(`Error getting page ${num}:`, err);
         pageRendering = false;
         // Re-enable buttons on error
         if(prevButton) prevButton.disabled = (currentPageNum <= 1);
         if(nextButton) nextButton.disabled = (currentPageNum >= pdfDoc.numPages);
    });
}

// --- Queue Rendering for Smooth Navigation ---
function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

// --- Navigation Button Event Handlers ---
function onPrevPage() {
  if (currentPageNum <= 1) return;
  currentPageNum--;
  queueRenderPage(currentPageNum);
}

function onNextPage() {
    // Check if pdfDoc and numPages are available before proceeding
    if (!pdfDoc || currentPageNum >= pdfDoc.numPages) return;
    currentPageNum++;
    queueRenderPage(currentPageNum);
}


// --- Download Button Setup ---
function setupDownloadButtons() {
    // Use the specific class added in the HTML
    const downloadButtons = document.querySelectorAll('a.pdf-download-button');

    if (downloadButtons.length === 0) {
         console.warn("No elements found with class 'pdf-download-button'. Download links not set.");
         return;
    }

    downloadButtons.forEach((button, index) => {
        if (button) {
            button.href = pdfUrl;
            button.setAttribute('download', pdfFileName);
            // console.log(`Download button ${index + 1} set up for ${pdfUrl}`);
        }
    });
}

// --- Main Initialization Function ---
function initializePdfViewer() {
    // Check if essential elements exist
    if (!canvas || !viewerContainer || !controlsContainer || !prevButton || !nextButton || !pageNumSpan || !pageCountSpan) {
        console.error("One or more PDF viewer elements not found in the DOM. Initialization aborted.");
        if(viewerContainer) viewerContainer.innerHTML = '<p style="color: red; text-align: center;">PDF Viewer could not be initialized (missing elements).</p>';
        return;
    }

     // Check if PDF.js library is loaded and ready
    if (typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
        console.error("PDF.js library not loaded or ready. Initialization aborted.");
         if(viewerContainer) viewerContainer.innerHTML = '<p style="color: red; text-align: center;">PDF library failed to load.</p>';
         return;
    }

    console.log("Initializing PDF Viewer...");

    // Add event listeners for navigation
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);

    // Asynchronously load the PDF document
    const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        // Optional: Improve CORS handling if needed, though direct links often work
        // withCredentials: false
    });

    loadingTask.promise.then(pdfDoc_ => {
        console.log("PDF loaded successfully.");
        pdfDoc = pdfDoc_;
        if(pageCountSpan) pageCountSpan.textContent = pdfDoc.numPages;

        // Initial render of the first page
        renderPage(currentPageNum); // Render page 1

        // Setup download buttons AFTER PDF is confirmed loadable
         setupDownloadButtons();

    }).catch(err => {
        console.error("Error loading PDF document:", err);
        let errorMessage = `Error loading PDF: ${err.message}.`;
        if (err.name === 'CorsNotAllowedError') {
            errorMessage += ' This might be a CORS issue. Ensure the server hosting the PDF allows requests from this domain.';
        } else if (err.name === 'UnexpectedResponseException') {
             errorMessage += ` Status: ${err.status}. The server returned an unexpected response.`;
        }
         errorMessage += ' Please try downloading the file directly.';

        if(viewerContainer) {
            viewerContainer.innerHTML = `<p style="color: red; text-align: center;">${errorMessage}</p>`;
        }
         if(controlsContainer) controlsContainer.style.display = 'none'; // Hide controls on error

         // Still try to set up download buttons even if viewer fails
         setupDownloadButtons();
    });
}

// --- Execute Initialization ---
// Use robust timing checks for Elementor/library compatibility
function attemptInitialization() {
    // Check if necessary elements are likely present AND pdfjsLib is defined and seems ready
     if (document.getElementById('pdf-canvas') && typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument) {
        initializePdfViewer();
    } else {
         // If not ready, wait a bit and try again, but don't retry forever
         console.log("PDF viewer elements or library not ready, retrying...");
         let retries = 5; // Limit retries
         const retryInterval = setInterval(() => {
            if (document.getElementById('pdf-canvas') && typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument) {
                 clearInterval(retryInterval);
                 initializePdfViewer();
            } else if (--retries <= 0) {
                 clearInterval(retryInterval);
                 console.error("PDF viewer initialization failed after multiple retries.");
                 if(viewerContainer && !viewerContainer.querySelector('p')) { // Avoid overwriting error messages
                    viewerContainer.innerHTML = '<p style="color: red; text-align: center;">Failed to initialize PDF viewer.</p>';
                 }
            }
         }, 300);
    }
}

// Run initialization logic after the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attemptInitialization);
} else {
    // DOM already loaded, but give a minimal timeout for potentially async loaded libs/elements
    setTimeout(attemptInitialization, 50);
}

// Optional: Listen for Elementor's frontend init event as another potential trigger,
// but the DOMContentLoaded/timeout above should be the primary method.
window.addEventListener('elementor/frontend/init', () => {
    console.log('Elementor frontend initialized, re-checking PDF viewer initialization.');
    // Only attempt if pdfDoc isn't already loaded (to avoid multiple initializations)
    if (!pdfDoc && document.getElementById('pdf-canvas')) {
       setTimeout(attemptInitialization, 100); // Give Elementor a moment
    } else if (pdfDoc) {
        // If already initialized, maybe just re-setup buttons in case Elementor rebuilt them
        setupDownloadButtons();
    }
});
