// The fold reader's Mac host (docs/fold-reader/SPEC.md 6.3): window.FR, the functions the app calls, and post, through
// webkit.messageHandlers.fold in the app's web view, else onto window.FR_SENT (a browser, the headless check).
var FR = (function () {
  function post(type, payload) {
    var m = Object.assign({ type: type }, payload || {})
    try { window.webkit.messageHandlers.fold.postMessage(m) } catch (e) { (window.FR_SENT = window.FR_SENT || []).push(m) }
  }
  var view = FoldView.mount(document.getElementById("app"), { post: post })
  return { load: view.load, state: view.state, fold: view.fold, words: view.words, paper: view.paper, flash: view.flash }
})()
