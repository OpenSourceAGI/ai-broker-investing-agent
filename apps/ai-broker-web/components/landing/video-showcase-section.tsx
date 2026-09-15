import { VideoLightbox } from "@/components/landing/video-lightbox"

/**
 * Standalone section for the agent-team walkthrough video.
 *
 * The video used to sit as a thumbnail in the corner of the agents section
 * header, small enough to read as a footnote. It carries the clearest
 * explanation of how the agents work together, so it gets its own titled
 * section at a size worth clicking.
 */
export function VideoShowcaseSection() {
  return (
    <section id="walkthrough" className="relative border-t border-border py-24 lg:py-32">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Watch
          </div>
          <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-5xl">
            See the agents work
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            A walkthrough of one full cycle — the analysts gathering evidence, the bull and bear
            debate, and the risk agent sizing the position that comes out of it.
          </p>
        </div>

        <VideoLightbox
          videoId="N5cHK6K50Ds"
          title="How the agent team builds one thesis"
          caption="How the agent team builds one thesis"
          className="mt-10 w-full"
        />
      </div>
    </section>
  )
}
