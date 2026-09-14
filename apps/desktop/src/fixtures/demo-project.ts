import { createEmptyProject, createSourceTranscript, type ProjectIR, type TranscriptWord } from "@cevra/project-ir";

const now = "2026-09-14T12:00:00.000Z";

const words: TranscriptWord[] = [
  { id: "word-1", text: "Quando", startMs: 8000, endMs: 8420, confidence: 0.98 },
  { id: "word-2", text: "a", startMs: 8450, endMs: 8540, confidence: 0.99 },
  { id: "word-3", text: "explicação", startMs: 8570, endMs: 9230, confidence: 0.98 },
  { id: "word-4", text: "é", startMs: 9270, endMs: 9380, confidence: 0.99 },
  { id: "word-5", text: "clara,", startMs: 9410, endMs: 9810, confidence: 0.97 },
  { id: "word-6", text: "a", startMs: 9850, endMs: 9940, confidence: 0.99 },
  { id: "word-7", text: "confiança", startMs: 9970, endMs: 10560, confidence: 0.98 },
  { id: "word-8", text: "cresce.", startMs: 10590, endMs: 11180, confidence: 0.98 },
  { id: "word-9", text: "Vamos", startMs: 22400, endMs: 22820, confidence: 0.96 },
  { id: "word-10", text: "rever", startMs: 22850, endMs: 23280, confidence: 0.98 },
  { id: "word-11", text: "os", startMs: 23310, endMs: 23480, confidence: 0.99 },
  { id: "word-12", text: "próximos", startMs: 23510, endMs: 24020, confidence: 0.97 },
  { id: "word-13", text: "passos", startMs: 24050, endMs: 24490, confidence: 0.98 },
  { id: "word-14", text: "juntos.", startMs: 24520, endMs: 25100, confidence: 0.97 }
];

export function createDemoProject(): ProjectIR {
  const project = createEmptyProject({
    id: "demo-project-consulta",
    name: "Consulta — Dra. Helena",
    locale: "pt-BR",
    now
  });

  project.sources = [
    {
      id: "source-main",
      kind: "video",
      uri: "demo://consulta-original.mov",
      displayName: "Consulta_Original.mov",
      durationMs: 78000,
      width: 3840,
      height: 2160,
      frameRate: 30,
      checksum: "demo-source-main"
    },
    {
      id: "source-broll",
      kind: "video",
      uri: "demo://broll-detalhes.mp4",
      displayName: "B-roll_Detalhes.mp4",
      durationMs: 18000,
      width: 1920,
      height: 1080,
      frameRate: 30
    },
    {
      id: "source-photo",
      kind: "image",
      uri: "demo://exame-ilustracao.png",
      displayName: "Ilustração_Exame.png",
      width: 1600,
      height: 900
    },
    {
      id: "source-music",
      kind: "audio",
      uri: "demo://trilha-calma.wav",
      displayName: "Trilha_Calma.wav",
      durationMs: 78000,
      sampleRate: 48000,
      channels: 2
    },
    {
      id: "source-sfx",
      kind: "audio",
      uri: "demo://transicao-suave.wav",
      displayName: "Transição_Suave.wav",
      durationMs: 1800,
      sampleRate: 48000,
      channels: 2
    }
  ];

  project.sourceTranscripts = [createSourceTranscript({
    sourceId: "source-main",
    wordTiming: "model",
    speakerState: "none",
    transcript: {
      language: "pt-BR",
      words,
      segments: [
        {
          id: "segment-1",
          startMs: 8000,
          endMs: 11180,
          text: "Quando a explicação é clara, a confiança cresce.",
          wordIds: words.slice(0, 8).map((word) => word.id)
        },
        {
          id: "segment-2",
          startMs: 22400,
          endMs: 25100,
          text: "Vamos rever os próximos passos juntos.",
          wordIds: words.slice(8).map((word) => word.id)
        }
      ]
    },
    provenance: {
      sourceChecksum: "demo-source-main",
      stages: [{
        kind: "transcription",
        executionId: "demo-transcription-presentation",
        engineId: "demo-presentation-adapter",
        engineVersion: "0.1.0",
        engineApiVersion: "1",
        modelId: "demo-fixture",
        createdAt: now
      }]
    }
  })];

  project.timeline = {
    durationMs: 78000,
    tracks: [
      { id: "track-v4", kind: "overlay", name: "V4", locked: false, hidden: false, muted: false },
      { id: "track-v3", kind: "overlay", name: "V3", locked: false, hidden: false, muted: false },
      { id: "track-v2", kind: "caption", name: "V2", locked: false, hidden: false, muted: false },
      { id: "track-v1", kind: "video", name: "V1", locked: false, hidden: false, muted: false },
      { id: "track-a3", kind: "audio", name: "A3", locked: false, hidden: false, muted: false },
      { id: "track-a2", kind: "audio", name: "A2", locked: false, hidden: false, muted: false },
      { id: "track-a1", kind: "audio", name: "A1", locked: false, hidden: false, muted: false }
    ],
    clips: [
      { id: "clip-main-1", trackId: "track-v1", sourceId: "source-main", timelineStartMs: 0, timelineEndMs: 27000, sourceStartMs: 2000, sourceEndMs: 29000, speed: 1, volume: 1, opacity: 1 },
      { id: "clip-main-2", trackId: "track-v1", sourceId: "source-main", timelineStartMs: 28500, timelineEndMs: 55000, sourceStartMs: 31500, sourceEndMs: 58000, speed: 1, volume: 1, opacity: 1 },
      { id: "clip-main-3", trackId: "track-v1", sourceId: "source-main", timelineStartMs: 56500, timelineEndMs: 78000, sourceStartMs: 56500, sourceEndMs: 78000, speed: 1, volume: 1, opacity: 1 },
      { id: "clip-broll-1", trackId: "track-v3", sourceId: "source-broll", timelineStartMs: 15000, timelineEndMs: 23000, sourceStartMs: 0, sourceEndMs: 8000, speed: 1, volume: 0, opacity: 1 },
      { id: "clip-broll-2", trackId: "track-v3", sourceId: "source-photo", timelineStartMs: 44000, timelineEndMs: 50500, sourceStartMs: 0, sourceEndMs: 6500, speed: 1, volume: 0, opacity: 1 },
      { id: "clip-music", trackId: "track-a2", sourceId: "source-music", timelineStartMs: 0, timelineEndMs: 78000, sourceStartMs: 0, sourceEndMs: 78000, speed: 1, volume: 0.24, opacity: 1 },
      { id: "clip-sfx", trackId: "track-a3", sourceId: "source-sfx", timelineStartMs: 43800, timelineEndMs: 45600, sourceStartMs: 0, sourceEndMs: 1800, speed: 1, volume: 0.7, opacity: 1 },
      { id: "clip-voice", trackId: "track-a1", sourceId: "source-main", timelineStartMs: 0, timelineEndMs: 78000, sourceStartMs: 0, sourceEndMs: 78000, speed: 1, volume: 1, opacity: 1 }
    ]
  };

  project.captions = [
    { id: "caption-1", startMs: 8000, endMs: 11180, text: "Quando a explicação é clara,", speakerId: "speaker-1", styleToken: "caption-clean" },
    { id: "caption-2", startMs: 11200, endMs: 14200, text: "a confiança cresce.", speakerId: "speaker-1", styleToken: "caption-clean" },
    { id: "caption-3", startMs: 22400, endMs: 25100, text: "Vamos rever os próximos passos juntos.", speakerId: "speaker-1", styleToken: "caption-clean" }
  ];
  project.graphics = [
    { id: "graphic-title", kind: "text", startMs: 2500, endMs: 7500, text: "Dra. Helena Duarte", styleToken: "lower-third-clean" },
    { id: "graphic-emphasis", kind: "shape", startMs: 33500, endMs: 39000, styleToken: "focus-outline" }
  ];
  project.audio = { masterGainDb: -1, normalizeTargetLufs: -14, musicDuckDb: -12 };
  project.style = { presetId: "consulta-medica-clean", accentColor: "#4c8dff", captionStyle: "clean", motionProfile: "restrained" };

  return project;
}
