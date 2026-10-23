# Screens: real screenshots in a video

A video about an application is clearer when it shows the application. The
`Screenshot` scene shows one image with a camera pan and highlights on its
parts; this file is how the images get there: imported or captured, with
their boxes measured and their sensitive data covered, through
`shots.mjs`. Every image a `Screenshot` shows must come through it: the lint
refuses any other.

## Where the images come from

1. **Images that already exist** (first choice): screenshots of a test run,
   of a bug report, or that the user gives. Import them:

   ```
   node "<plugin>/scripts/shots.mjs" import "<videoDir>" <image>... [--name <n>]
   ```

   A test suite can write a `<image>.boxes.json` next to each screenshot
   with the boxes of the elements it touched (`locator.boundingBox()` in a
   browser test), and the masks to draw:

   ```json
   { "size": [1600, 900], "boxes": { "search": [1210, 96, 92, 38] }, "mask": [[300, 210, 180, 400]] }
   ```

   `import` reads it by itself. Without it, the boxes are measured by eye
   (below).
2. **A capture**, when no existing image shows what the video needs and the
   application is a web site or web app the user can reach (local or
   remote). Write `<videoDir>/capture.json` (format: `shots.mjs --help`;
   an example: `<plugin>/examples/acme-shop-site/`) and run:

   ```
   node "<plugin>/scripts/shots.mjs" capture "<videoDir>" "<videoDir>/capture.json" [--env-file <file>] [--allow-env <NAME>,...]
   ```

   The viewport is the image: 1600x900 for a 16:9 video, 900x1600 for 9:16.
   Name every element the narration will point at in `boxes`, with a CSS
   selector: the box is measured on the page, exactly.
3. **A desktop application**: no capture yet; import the user's screenshots.

## Before a capture: ask, once

A capture logs in to the user's application. Ask before the first one of a
video, in one message: the address, the pages, where the login secrets are
(the names of the variables, or an env file), and that the capture reaches
only that host. Never read or print the secrets yourself: give the env file
to `--env-file` and the variable names to the `fill` steps. A secret that
is already in the environment is read only when its name is passed with
`--allow-env`: no other variable of the environment can be typed into a page. A site behind
single sign-on, MFA or a captcha cannot be scripted: ask the user for a
saved session (`--storage-state`) or for screenshots to import.

## Covering what must not be seen

Screens of real applications hold people's names, emails, account numbers,
amounts tied to a person, user names, server names. A video is easy to
forward; what it shows, it shows to everyone.

- **The capture covers before the screenshot**: the `mask` selectors of the
  shot, and every text that looks like an email, an IBAN, a card or long
  number, an IP address, a phone, a tax code or a token (`autoMask`, on by
  default). The uncovered pixels never reach the disk.
- **Look at every image** (read it as an image) before it goes in the video,
  and cover what is still visible: names, customer codes, amounts tied to a
  person, user names, internal host names, a client's name or logo when the
  video may leave the team.

  ```
  node "<plugin>/scripts/shots.mjs" mask "<videoDir>" <name> x,y,w,h [x,y,w,h ...] --why "customer names"
  ```

  The fill is solid, drawn into the pixels: a blur can be read back, and the
  stills, the contact sheets and the page would hold the original.
- Then mark the image as looked at: `shots.mjs review "<videoDir>" <name>`.
  The lint refuses a `Screenshot` whose image is not reviewed, or changed
  after shots.mjs wrote it.
- At the narration checkpoint, show the user the images with their masks
  (the paths of `public/shots/*.png`) next to the sentences. Without a
  checkpoint, list every mask and why in `OUTCOME.md`.

## Measuring a box by eye

When the page is not there to measure (an imported image without a boxes
file), draw the grid and read the coordinates on it:

```
node "<plugin>/scripts/shots.mjs" grid "<videoDir>" <name>                    # qa/grid-<name>.png
node "<plugin>/scripts/shots.mjs" grid "<videoDir>" <name> --crop x,y,w,h --step 10   # enlarged
node "<plugin>/scripts/shots.mjs" box  "<videoDir>" <name> <box name> x,y,w,h
```

Read the grid image, write the box, draw the grid again (it shows the boxes
in green) and correct until the box sits on the element. The lint warns on a
box measured by eye; the contact sheet is the check.

## In the storyboard

```json
{ "scene": "Screenshot",
  "props": { "src": "shots/orders.png",
             "regions": [ { "ref": "failed", "kind": "callout", "label": "payment failed", "at": "failed" } ],
             "pan": [ { "to": [1480, 330, 1.4], "at": "failed" } ] } }
```

`size` comes from `shots.json`; `ref` names a box of the image. The pan
target is a point of the image: the centre of the box it goes to (`x + w/2`,
`y + h/2`, from `shots.mjs list` or `shots.json`).

## Common mistakes

- Showing an image that did not come through `shots.mjs`: its size, boxes
  and masks are unknown, and the lint refuses it.
- Guessing a box from a glance at the image: use a box measured on the page
  or a test's boxes file, or measure it on the grid.
- Trusting `autoMask` alone: it finds text shapes (emails, numbers), not
  names. Look at the image.
- Covering with a blur or a translucent box: use `mask`, solid.
- Printing an env file, or writing a secret in `capture.json` as `text`:
  secrets go only through `env`.
- Capturing a 1600x900 page for a 9:16 video: the image is a strip in a tall
  frame. Capture at 900x1600, or show a cropped part with the pan.
- Allowing every host to make a page load: list only the hosts the page
  needs (`allowHosts`), and say them in `OUTCOME.md`.
- Counting on the screenshot to name the field: a full-width screen is
  drawn about 1000-1100 px wide, and a 12 px UI label becomes unreadable
  even at zoom 2. Put the field's name in the callout label ("Status:
  payment failed"), and pan to 1.8-2 on tall pages. A final
  review classed an unreadable field name as P1 in a test video.
- A callout whose label lands on the element another highlight points at
  (the label hangs under the box): use brackets there, or a region further
  down. Seen in a test video's review.
- Covering the user's data and forgetting the rest of the screen: logos,
  footers with a company's registration number, environment or record
  labels in a corner. Look at the edges of the image too.

## Not yet proven

- Capture of sites behind single sign-on with a saved session
  (`--storage-state`): written, not tried.
- The WebSocket filter and the WebRTC and DNS-prefetch switches were tried on a site without WebSockets only.
- Desktop applications: import only; no capture of a native window.
- `autoMask` patterns are shapes; they miss names and catch harmless numbers
  (dates written as long numbers). Seen in test runs: the look at every
  image is what found the names.
