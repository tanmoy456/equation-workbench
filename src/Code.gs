/**
 * Equation Workbench — Google Slides add-on (server side)
 *
 * Adds a menu, opens the editor sidebar, and inserts the rendered
 * equation PNG onto the current slide via the Slides API.
 */

function onOpen() {
  SlidesApp.getUi()
    .createAddonMenu()
    .addItem('Open editor', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Equation Workbench');
  SlidesApp.getUi().showSidebar(html);
}

/**
 * Called from the sidebar via google.script.run.
 * payload = { dataUrl: "data:image/png;base64,...", latex: "...", width: Number, height: Number }
 */
function insertEquation(payload) {
  var base64 = payload.dataUrl.replace(/^data:image\/png;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'equation.png');

  var pres = SlidesApp.getActivePresentation();
  var selection = pres.getSelection();
  var page = selection && selection.getCurrentPage();
  if (!page) {
    throw new Error('Click on a slide first, then insert.');
  }

  var slide = page.asSlide();
  var image = slide.insertImage(blob);

  // Display size (points). The PNG itself is rendered at higher resolution,
  // so it stays crisp when Slides scales it to this size.
  if (payload.width && payload.height) {
    image.setWidth(payload.width).setHeight(payload.height);
  }

  // Center on the slide.
  image.setLeft((pres.getPageWidth() - image.getWidth()) / 2);
  image.setTop((pres.getPageHeight() - image.getHeight()) / 2);

  // Stash the LaTeX in the image description so it can be recovered later
  // (right-click image > Alt text in Slides shows it).
  try { image.setDescription('latex:' + payload.latex); } catch (e) {}

  return 'inserted';
}

/**
 * Finds the currently selected equation image (one this add-on inserted,
 * identified by the 'latex:' tag in its description). Returns null if none.
 */
function getSelectedEquationImage_() {
  var sel = SlidesApp.getActivePresentation().getSelection();
  if (!sel) return null;
  var range = sel.getPageElementRange();
  if (!range) return null;
  var els = range.getPageElements();
  for (var i = 0; i < els.length; i++) {
    if (els[i].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
      var img = els[i].asImage();
      var desc = img.getDescription() || '';
      if (desc.indexOf('latex:') === 0) return img;
    }
  }
  return null;
}

/** Reads the stored LaTeX from the selected equation back into the editor. */
function readSelectedEquation() {
  var img = getSelectedEquationImage_();
  if (!img) {
    throw new Error('Select an equation this add-on inserted (no equation data found on the selection).');
  }
  return (img.getDescription() || '').replace(/^latex:/, '');
}

/**
 * Replaces the selected equation in place with a freshly rendered one,
 * keeping its position and height (width scales to the new aspect ratio).
 * payload = { dataUrl, latex, width, height }
 */
function replaceSelectedEquation(payload) {
  var img = getSelectedEquationImage_();
  if (!img) {
    throw new Error('Select an equation this add-on inserted first.');
  }

  var left = img.getLeft(), top = img.getTop();
  var oldW = img.getWidth(), oldH = img.getHeight();
  var slide = img.getParentPage().asSlide();

  var base64 = payload.dataUrl.replace(/^data:image\/png;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'equation.png');
  var newImg = slide.insertImage(blob);

  // Anchor to the old top-left; keep height, scale width so the new
  // equation is not distorted if its shape changed.
  if (payload.height) {
    var scale = oldH / payload.height;
    newImg.setHeight(oldH).setWidth(payload.width * scale);
  } else {
    newImg.setWidth(oldW).setHeight(oldH);
  }
  newImg.setLeft(left).setTop(top);
  try { newImg.setDescription('latex:' + payload.latex); } catch (e) {}

  img.remove();
  return 'replaced';
}
