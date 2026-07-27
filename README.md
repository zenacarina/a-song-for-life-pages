# A Song for Life — Memorial Page System

This is the master source for all private memorial pages. It replaces the fragile “upload a ZIP containing every page” workflow.

## How it works

- `template/styles.css` contains the shared design.
- Each memorial has one folder inside `memorials/`.
- Each folder contains `data.json`, its hero portrait and its social share image.
- `npm run build` generates the complete deployable site in `dist/`.
- Cloudflare Pages should connect directly to the GitHub repository and rebuild automatically whenever a change is pushed.

The published root page deliberately does **not** list memorial names. Each memorial remains available only by its direct URL, such as `/margaret-rose/` or `/dennis/`.

## First-time GitHub and Cloudflare setup

1. Create a new private GitHub repository, for example `asongforlife-memorials`.
2. Upload all files in this project to that repository.
3. In Cloudflare Pages, open the existing memorial Pages project or create a new one.
4. Connect it to the GitHub repository.
5. Use these build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave blank
   - Node version: 18 or newer
6. Keep the custom domain `remembering.asongforlife.co.uk` connected to this Pages project.

After that, future updates are made in GitHub—not by uploading deployment ZIPs.

## Add a new memorial

1. Duplicate one existing folder inside `memorials/`.
2. Rename the folder to the new lowercase URL slug, for example `john-smith`.
3. Edit `data.json` and make the `slug` exactly match the folder name.
4. Replace the portrait and share-card files, then update their filenames in `data.json`.
5. Run `npm run check` to validate the content.
6. Run `npm run build` to preview the generated files in `dist/`.
7. Commit and push to GitHub. Cloudflare will publish it automatically.

The new page will appear at:

`https://remembering.asongforlife.co.uk/john-smith/`

## Important editing rules

- Keep `data.json` as valid JSON: use double quotes and commas exactly as shown.
- Put the complete lyrics in the `lyrics` field. The first four non-empty lines become the preview automatically.
- Use `<br>` only in `tributeHtml`; all other prose should be plain text.
- Keep `noindex` enabled unless the family explicitly requests a publicly searchable memorial.
- Never delete an existing memorial folder when adding a new one.
- Images are cached for a long time. When replacing an image, give the replacement a new filename and update `data.json`.

## Local commands

```bash
npm run check
npm run build
```

No packages need to be installed; the generator uses Node.js built-in modules only.
