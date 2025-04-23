// --- Configuration ---
const pdfUrl = 'https://document-portal.ca.powerschool.com/pdf/_g8o5kwivv.pdf?AWSAccessKeyId=AKIAQFEOQEHRFX2R67UY&Expires=1745973188&Signature=i6yAN5vria4XNg8zVnEQ4NpJwgk%3D'; // Use the provided URL
const pdfFileName = '_g8o5kwivv.pdf'; // Desired filename for download

// --- PDF.js Initialization ---
let pdfjsLib; // Will be assigned when the module loads

// --- Global Variables ---
let pdfDoc = null;
let currentPageNum = 1;
let pageRendering = false;
let pageNumPending = null;

// --- DOM Element References ---
let canvas = null;
let pageNumSpan = null;
let pageCountSpan = null;
let prevButton = null;
let nextButton = null;
let viewerContainer = null;
let controlsContainer = null;

// --- Get DOM Elements (run after DOM is ready) ---
function getElements() {
    canvas = document.getElementById('pdf-canvas');
    pageNumSpan = document.getElementById('page-num');
    pageCountSpan = document.getElementById('page-count');
    prevButton = document.getElementById('prev-page');
    nextButton = document.getElementById('next-page');
    viewerContainer = document.querySelector('.pdf-viewer-container'); // White box container
    controlsContainer = document.querySelector('.pdf-controls'); // Controls container
}

// --- Core PDF Rendering Function ---
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
        const dpr = window.devicePixelRatio || 1; // Get device pixel ratio

        // Calculate the desired display width (layout width)
        // Fit within container, subtracting padding
        const availableLayoutWidth = viewerContainer.clientWidth - (2 * parseFloat(getComputedStyle(viewerContainer).paddingLeft || 0));

        // Get viewport at scale 1 to determine aspect ratio
        const viewportBase = page.getViewport({ scale: 1 });
        const scale = availableLayoutWidth / viewportBase.width;
        const viewportScaled = page.getViewport({ scale: scale });

        // Set canvas drawing surface size based on DPR for high-res rendering
        canvas.width = Math.floor(viewportScaled.width * dpr);
        canvas.height = Math.floor(viewportScaled.height * dpr);

        // Set canvas display size using CSS (this scales the high-res drawing down)
        canvas.style.width = `${Math.floor(viewportScaled.width)}px`;
        canvas.style.height = `${Math.floor(viewportScaled.height)}px`;

        // Adjust context scale for high-DPR rendering
        // The viewport scaling already handles fitting the content,
        // We just need the context to match the canvas pixel density
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);


        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: ctx,
          viewport: viewportScaled // Use the viewport scaled for layout size
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
            // console.log(`Download button ${index + 1} set up.`);
        }
    });
}

// --- Main Initialization Function ---
async function initializePdfViewer() {
    // Get elements first
    getElements();

    // Check if essential elements exist
    if (!canvas || !viewerContainer || !controlsContainer || !prevButton || !nextButton || !pageNumSpan || !pageCountSpan) {
        console.error("One or more PDF viewer elements not found in the DOM. Initialization aborted.");
        if(viewerContainer) viewerContainer.innerHTML = '<p style="color: red; text-align: center;">PDF Viewer could not be initialized (missing elements).</p>';
        return;
    }

    // Dynamically import PDF.js library
    try {
        const pdfjsModule = await import('//mozilla.github.io/pdf.js/build/pdf.mjs');
        pdfjsLib = pdfjsModule.pdfjsLib;

        // Check if library loaded correctly
        if (!pdfjsLib || !pdfjsLib.getDocument) {
           throw new Error("PDF.js library object not found after import.");
        }

         // Set the worker source (important for performance)
         pdfjsLib.GlobalWorkerOptions.workerSrc = '//mozilla.github.io/pdf.js/build/pdf.worker.mjs';

    } catch (error) {
        console.error("Failed to load PDF.js library:", error);
        if(viewerContainer) viewerContainer.innerHTML = '<p style="color: red; text-align: center;">PDF library failed to load.</p>';
        return;
    }


    console.log("Initializing PDF Viewer...");

    // Add event listeners for navigation
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);

    // Asynchronously load the PDF document
    // Add { withCredentials: false } if you encounter CORS issues with the PDF URL,
    // although the provided URL seems public.
    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
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
        // Display more specific error if available
        let errMsg = `Error loading PDF: ${err.message || 'Unknown error'}.`;
        if (err.name === 'CorsNotEnabled') {
           errMsg = 'Error: Could not load PDF due to CORS policy. The server hosting the PDF needs to allow requests from this website.';
        } else if (err.name === 'UnexpectedResponse') {
            errMsg = `Error: Unexpected server response (${err.status}) while loading PDF.`;
        }

        if(viewerContainer) {
            viewerContainer.innerHTML = `<p style="color: red; text-align: center;">${errMsg} Please try downloading the file.</p>`;
        }
         if(controlsContainer) controlsContainer.style.display = 'none'; // Hide controls on error
         // Still try to set up download buttons even if viewer fails
         setupDownloadButtons();
    });
}

// --- Execute Initialization ---
// Wait for the DOM to be fully loaded before trying to access elements
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePdfViewer);
} else {
    // DOMContentLoaded has already fired
    initializePdfViewer();
}

// Optional: Re-run setupDownloadButtons if using Elementor and buttons might load later
// Be cautious with this, as it might run multiple times unnecessarily
window.addEventListener('elementor/frontend/init', () => {
    console.log('Elementor frontend initialized, re-checking download buttons.');
    setTimeout(setupDownloadButtons, 500); // Delay slightly after init
});
