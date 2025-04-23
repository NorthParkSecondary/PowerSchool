// --- Configuration ---
const pdfUrl = 'https://api.printnode.com/static/test/pdf/multipage.pdf';
const pdfFileName = '_g8o5kwivv.pdf'; // Desired filename for download

// --- PDF.js Initialization ---
// Get the library object (assuming pdf.mjs was loaded)
const { pdfjsLib } = globalThis;
if (!pdfjsLib) {
    console.error("PDF.js library not found. Ensure pdf.mjs is loaded.");
} else {
    // Set the worker source (important for performance)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '//mozilla.github.io/pdf.js/build/pdf.worker.mjs';
}

// --- Global Variables ---
let pdfDoc = null;
let currentPageNum = 1;
let pageRendering = false;
let pageNumPending = null;

// --- DOM Element References ---
const canvas = document.getElementById('pdf-canvas');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevButton = document.getElementById('prev-page');
const nextButton = document.getElementById('next-page');
const viewerContainer = document.querySelector('.pdf-viewer-container'); // White box container
const controlsContainer = document.querySelector('.pdf-controls'); // Controls container

// --- Core PDF Rendering Function ---
function renderPage(num) {
    if (!pdfDoc || !canvas || !viewerContainer) {
        console.error("PDF Document or required elements not ready for rendering.");
        return; // Exit if dependencies aren't met
    }
    pageRendering = true;

    // Disable buttons during render
    if(prevButton) prevButton.disabled = true;
    if(nextButton) nextButton.disabled = true;

    // Get page
    pdfDoc.getPage(num).then(page => {
        const ctx = canvas.getContext('2d');

        // Calculate the scale to fit the page within the container width, maintaining aspect ratio
        const availableWidth = viewerContainer.clientWidth - 20; // Subtract padding
        const viewport = page.getViewport({ scale: 1 });
        const scale = availableWidth > 0 ? availableWidth / viewport.width : 1; // Avoid division by zero or negative width
        const scaledViewport = page.getViewport({ scale: scale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: ctx,
          viewport: scaledViewport
        };
        const renderTask = page.render(renderContext);

        // Wait for rendering to finish
        renderTask.promise.then(() => {
          pageRendering = false;
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
           // Re-enable buttons on error, potentially based on current page number
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
  if (currentPageNum >= pdfDoc.numPages) return;
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
            // console.log(`Download button ${index + 1} set up.`);
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

     // Check if PDF.js library is loaded
    if (!pdfjsLib) {
        console.error("PDF.js library failed to load. Initialization aborted.");
         if(viewerContainer) viewerContainer.innerHTML = '<p style="color: red; text-align: center;">PDF library failed to load.</p>';
         return;
    }

    console.log("Initializing PDF Viewer...");

    // Add event listeners for navigation
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);

    // Asynchronously load the PDF document
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
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
        if(viewerContainer) {
            viewerContainer.innerHTML = `<p style="color: red; text-align: center;">Error loading PDF: ${err.message}. Please try downloading the file.</p>`;
        }
         if(controlsContainer) controlsContainer.style.display = 'none'; // Hide controls on error
         // Still try to set up download buttons even if viewer fails
         setupDownloadButtons();
    });
}

// --- Execute Initialization ---
// Use robust timing checks for Elementor compatibility and library loading
function attemptInitialization() {
    // Check if necessary elements are likely present AND pdfjsLib is defined
     if (document.getElementById('pdf-canvas') && typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument) {
        initializePdfViewer();
    } else {
         // If not ready, wait a bit and try again
         console.log("PDF viewer elements or library not ready, retrying...");
         setTimeout(attemptInitialization, 300);
    }
}

if (document.readyState === 'loading') {
    // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', attemptInitialization);
} else {
    // DOMContentLoaded has already fired, but scripts might still be loading/executing
    setTimeout(attemptInitialization, 100); // Short delay to allow other scripts
}

// Optional: Listen for Elementor's frontend init event as another potential trigger,
// but rely primarily on DOMContentLoaded / timeout
window.addEventListener('elementor/frontend/init', () => {
    console.log('Elementor frontend initialized, ensuring PDF viewer starts if not already.');
    // Only attempt if pdfDoc isn't already loaded (to avoid multiple initializations)
    if (!pdfDoc) {
       setTimeout(attemptInitialization, 100); // Give Elementor a moment
    }
});