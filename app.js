// Register the service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Handle form submission
document.getElementById('snow-report-form').addEventListener('submit', function(event) {
  event.preventDefault();
  
  const location = document.getElementById('location').value;
  const snowDepth = document.getElementById('snow-depth').value;
  const snowType = document.getElementById('snow-type').value;

  console.log(`Location: ${location}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}`);
  alert("Report submitted successfully!");
});
