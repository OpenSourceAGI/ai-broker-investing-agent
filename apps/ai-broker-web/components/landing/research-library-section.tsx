const DRIVE_FOLDER_ID = "12wj9_7e94fcJvahfYsnyme1-v7Pdnl5J"

/**
 * Embedded Google Drive folder of research PDFs.
 *
 * Uses Drive's folder-embed endpoint, so the folder (and every file in it)
 * must be shared as "Anyone with the link → Viewer" for visitors to see it.
 */
export function ResearchLibrarySection() {
  return (
    <section id="research-library" className="relative border-t border-border py-24 lg:py-32">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Library
          </div>
          <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-5xl">
            Research documents
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Papers and PDFs behind the strategies. Open any file to read it in Drive.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
          <iframe
            src={`https://drive.google.com/embeddedfolderview?id=${DRIVE_FOLDER_ID}#grid`}
            title="PDF documents"
            loading="lazy"
            className="h-[800px] w-full border-0"
          />
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a
            href={`https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Open the folder in Google Drive
          </a>
        </p>
      </div>
    </section>
  )
}
