'use strict';
const fs = require('fs');
const path = require('path');

class WalkthroughVideoGenerator {
  constructor(options = {}) {
    this.defaultWidth = options.width || 1920;
    this.defaultHeight = options.height || 1080;
    this.defaultFps = options.fps || 30;
  }

  formatTimecode(ms) {
    const totalSec = Math.floor(ms / 1000);
    const msec = Math.floor(ms % 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');

    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(msec)}`;
  }

  buildWebVTT(cues = []) {
    let vtt = 'WEBVTT - RobOS Automated Walkthrough\n\n';

    cues.forEach((cue, index) => {
      const start = this.formatTimecode(cue.startMs || 0);
      const end = this.formatTimecode(cue.endMs || (cue.startMs + 3000));
      const text = cue.narration || cue.text || '';

      vtt += `${index + 1}\n`;
      vtt += `${start} --> ${end}\n`;
      vtt += `${text}\n\n`;
    });

    return vtt.trim() + '\n';
  }

  buildMetadata(cues = [], options = {}) {
    const totalDurationMs = cues.length > 0 ? (cues[cues.length - 1].endMs || (cues[cues.length - 1].startMs + 3000)) : 0;

    const chapters = cues.map((cue, index) => ({
      stepIndex: index + 1,
      startMs: cue.startMs || 0,
      endMs: cue.endMs || (cue.startMs + 3000),
      startTimecode: this.formatTimecode(cue.startMs || 0),
      endTimecode: this.formatTimecode(cue.endMs || (cue.startMs + 3000)),
      narration: cue.narration || cue.text || '',
      callout: cue.callout || `Step ${index + 1}`,
      target: cue.target || null,
      action: cue.action || 'interact',
    }));

    return {
      schemaVersion: '1.0.0',
      slug: options.slug || 'walkthrough-demo',
      title: options.title || 'RobOS Automated Walkthrough',
      resolution: {
        width: options.width || this.defaultWidth,
        height: options.height || this.defaultHeight,
      },
      fps: options.fps || this.defaultFps,
      durationMs: totalDurationMs,
      durationFormatted: this.formatTimecode(totalDurationMs),
      stepCount: cues.length,
      audioTrack: options.audio !== false,
      generatedAt: new Date().toISOString(),
      chapters,
    };
  }

  generateWalkthroughArtifacts(cues = [], options = {}) {
    const vttContent = this.buildWebVTT(cues);
    const metadata = this.buildMetadata(cues, options);

    if (options.outDir) {
      fs.mkdirSync(options.outDir, { recursive: true });
      fs.writeFileSync(path.join(options.outDir, `${metadata.slug}.vtt`), vttContent, 'utf8');
      fs.writeFileSync(path.join(options.outDir, `${metadata.slug}.json`), JSON.stringify(metadata, null, 2), 'utf8');
    }

    return {
      vttContent,
      metadata,
    };
  }
}

module.exports = { WalkthroughVideoGenerator };
