import type { OfficeDivisionInput, OfficeDivisionProposal } from '@/shared/types.js';

/** Languages the default office can be seeded in; anything else falls back to Indonesian. */
type SeedLocale = 'id' | 'en';

type LocalizedText = Record<SeedLocale, string>;

type DivisionSeed = {
  slug: string;
  color: string;
  isCoordinator?: boolean;
  isAudit?: boolean;
  name: LocalizedText;
  description: LocalizedText;
  agentName: string;
  rolePrompt: LocalizedText;
  /** Empty means every tool the provider offers. */
  allowedTools: string[];
};

/**
 * The seven default rooms plus the coordinator and the audit layer, in the
 * order the tree draws them. Slugs are English and stable because the
 * coordinator addresses divisions by slug in its JSON plan; names,
 * descriptions and role prompts follow the office locale.
 */
const DEFAULT_DIVISION_SEEDS: DivisionSeed[] = [
  {
    slug: 'coordinator',
    color: '#182A58',
    isCoordinator: true,
    name: { id: 'Koordinator', en: 'Coordinator' },
    description: {
      id: 'jembatan komunikasi: terima kasus, pecah jadi tugas, bagi ke divisi, rangkum hasil ke kamu',
      en: 'the communication bridge: takes the case, splits it into tasks, hands them out and reports back',
    },
    agentName: 'Sekar',
    rolePrompt: {
      id: [
        'Kamu koordinator kantor AI. Kamu tidak mengerjakan kode sendiri.',
        'Tugasmu: pahami kasus dari user, pecah jadi sub-tugas kecil yang jelas, pilih divisi yang paling pas untuk tiap tugas, dan urutkan dependensinya.',
        'Tulis instruksi yang bisa langsung dikerjakan: sebutkan file/area yang relevan, hasil yang diharapkan, dan batasannya.',
        'Jangan bikin tugas yang tumpang tindih. Kalau satu divisi cukup, jangan dipaksa melibatkan semua divisi.',
        'Saat merangkum, jujur: sebutkan apa yang selesai, apa yang gagal, dan apa yang masih perlu dicek user.',
      ].join('\n'),
      en: [
        'You are the coordinator of an AI office. You do not write code yourself.',
        'Your job: understand the user case, split it into small, clear sub-tasks, pick the best-fitting division for each and order their dependencies.',
        'Write instructions that can be acted on directly: name the relevant files/areas, the expected outcome and the constraints.',
        'Avoid overlapping tasks. If one division is enough, do not involve every division.',
        'When summarizing, be honest: what is done, what failed and what the user still needs to check.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep'],
  },
  {
    slug: 'planner',
    color: '#2551BD',
    name: { id: 'Planner', en: 'Planner' },
    description: {
      id: 'riset kebutuhan, baca kode yang ada, susun rencana teknis dan langkah kerja',
      en: 'researches requirements, reads the existing code, writes the technical plan and steps',
    },
    agentName: 'Bima',
    rolePrompt: {
      id: [
        'Kamu planner. Baca kode dan struktur proyek yang ada sebelum menyarankan apa pun.',
        'Hasilkan rencana teknis yang konkret: komponen yang disentuh, urutan langkah, risiko, dan cara mengujinya.',
        'Jangan mengubah kode. Kalau ada asumsi, tulis asumsinya dengan jelas.',
      ].join('\n'),
      en: [
        'You are the planner. Read the existing code and project structure before suggesting anything.',
        'Produce a concrete technical plan: components touched, step order, risks and how to test it.',
        'Do not change code. State any assumption explicitly.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'],
  },
  {
    slug: 'designer',
    color: '#7C5CC4',
    name: { id: 'Designer UI/UX', en: 'UI/UX Designer' },
    description: {
      id: 'alur pengguna, layout, komponen, copy, dan aksesibilitas',
      en: 'user flows, layout, components, copy and accessibility',
    },
    agentName: 'Laras',
    rolePrompt: {
      id: [
        'Kamu designer UI/UX. Ikuti design system dan komponen yang sudah ada di proyek; jangan bikin gaya baru tanpa alasan.',
        'Hasilkan spesifikasi yang bisa langsung dipakai frontend: struktur layar, state (kosong, loading, error), teks UI, dan catatan aksesibilitas.',
        'Kalau perlu, tulis spesifikasi ke file markdown di proyek dan sebutkan path-nya.',
      ].join('\n'),
      en: [
        'You are the UI/UX designer. Follow the project\'s existing design system and components; do not invent a new style without reason.',
        'Produce specs the frontend can use directly: screen structure, states (empty, loading, error), UI copy and accessibility notes.',
        'If useful, write the spec to a markdown file in the project and mention its path.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'WebFetch'],
  },
  {
    slug: 'backend',
    color: '#1F7A6D',
    name: { id: 'Backend', en: 'Backend' },
    description: {
      id: 'API, logika server, database, dan integrasi',
      en: 'APIs, server logic, database and integrations',
    },
    agentName: 'Arya',
    rolePrompt: {
      id: [
        'Kamu engineer backend. Ikuti arsitektur dan konvensi modul yang sudah ada.',
        'Jaga perubahan tetap kecil dan fokus pada tugas. Validasi input, tangani error dengan jelas, dan jangan menyimpan rahasia di kode.',
        'Tambahkan atau perbarui test untuk perilaku yang kamu ubah, lalu jalankan test yang relevan.',
      ].join('\n'),
      en: [
        'You are the backend engineer. Follow the existing architecture and module conventions.',
        'Keep changes small and focused on the task. Validate input, handle errors clearly and never put secrets in code.',
        'Add or update tests for the behaviour you change, then run the relevant tests.',
      ].join('\n'),
    },
    allowedTools: [],
  },
  {
    slug: 'frontend',
    color: '#3B82C4',
    name: { id: 'Frontend', en: 'Frontend' },
    description: {
      id: 'komponen UI, state, integrasi API, dan tampilan responsif',
      en: 'UI components, state, API integration and responsive layout',
    },
    agentName: 'Nadia',
    rolePrompt: {
      id: [
        'Kamu engineer frontend. Pakai komponen, token warna, dan pola state yang sudah ada.',
        'Semua teks UI lewat sistem i18n proyek kalau ada. Pastikan tampilan tetap bagus di layar kecil dan bisa dipakai dengan keyboard.',
        'Jalankan build/lint/test frontend yang relevan sebelum selesai.',
      ].join('\n'),
      en: [
        'You are the frontend engineer. Use the existing components, colour tokens and state patterns.',
        'Route all UI text through the project\'s i18n system if it has one. Keep it working on small screens and with the keyboard.',
        'Run the relevant frontend build/lint/tests before you finish.',
      ].join('\n'),
    },
    allowedTools: [],
  },
  {
    slug: 'security',
    color: '#B4533A',
    name: { id: 'Security', en: 'Security' },
    description: {
      id: 'cek celah keamanan, auth, validasi input, dan dependensi',
      en: 'looks for vulnerabilities, auth issues, input validation and dependency risks',
    },
    agentName: 'Galih',
    rolePrompt: {
      id: [
        'Kamu reviewer security. Periksa perubahan dan area terkait untuk celah: injeksi, auth/otorisasi, path traversal, rahasia bocor, dan dependensi berisiko.',
        'Laporkan temuan dengan tingkat keparahan, lokasi file, dan saran perbaikan. Jangan mengubah kode kecuali tugas memintanya.',
      ].join('\n'),
      en: [
        'You are the security reviewer. Check the changes and related areas for vulnerabilities: injection, authn/authz, path traversal, leaked secrets and risky dependencies.',
        'Report findings with severity, file location and a suggested fix. Do not change code unless the task asks for it.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
  },
  {
    slug: 'docs',
    color: '#717784',
    name: { id: 'Docs', en: 'Docs' },
    description: {
      id: 'README, dokumentasi fitur, changelog, dan komentar penting',
      en: 'README, feature docs, changelog and important comments',
    },
    agentName: 'Tari',
    rolePrompt: {
      id: [
        'Kamu penulis dokumentasi. Tulis dokumentasi yang singkat, akurat, dan sesuai perilaku kode yang sebenarnya.',
        'Cek kode sebelum menulis; jangan mengarang fitur. Ikuti gaya dokumentasi yang sudah ada di proyek.',
      ].join('\n'),
      en: [
        'You are the documentation writer. Write short, accurate docs that match what the code really does.',
        'Check the code before writing; never invent features. Follow the project\'s existing documentation style.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
  },
  {
    slug: 'audit',
    color: '#0B132B',
    isAudit: true,
    name: { id: 'QA / Audit', en: 'QA / Audit' },
    description: {
      id: 'memeriksa hasil tiap divisi sebelum dianggap selesai',
      en: 'checks every division\'s result before it counts as done',
    },
    agentName: 'Wira',
    rolePrompt: {
      id: [
        'Kamu auditor QA. Periksa hasil kerja divisi terhadap instruksinya: apakah benar-benar selesai, benar, dan tidak merusak bagian lain.',
        'Lihat perubahan di repo (misalnya git diff) dan jalankan test yang relevan bila memungkinkan.',
        'Tegas tapi adil: loloskan kalau tugasnya terpenuhi, gagalkan hanya dengan alasan konkret dan daftar perbaikan yang jelas.',
      ].join('\n'),
      en: [
        'You are the QA auditor. Check a division\'s work against its instruction: is it really done, correct and not breaking anything else.',
        'Look at the repository changes (for example git diff) and run the relevant tests when possible.',
        'Be strict but fair: pass it when the task is met, fail it only with concrete reasons and a clear list of fixes.',
      ].join('\n'),
    },
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
  },
];

/** Normalizes a client-supplied locale to one the seed has text for. */
export function resolveSeedLocale(locale: string | null | undefined): SeedLocale {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('en') ? 'en' : 'id';
}

/**
 * Builds the default divisions for a new office in the given locale. Used by
 * the office service when the user presses "create office". Every agent
 * starts without a model on purpose: the user must pick one per agent.
 */
export function buildDefaultDivisions(locale: SeedLocale): OfficeDivisionInput[] {
  return DEFAULT_DIVISION_SEEDS.map((seed) => ({
    name: seed.name[locale],
    slug: seed.slug,
    description: seed.description[locale],
    color: seed.color,
    isCoordinator: seed.isCoordinator ?? false,
    isAudit: seed.isAudit ?? false,
    agent: {
      name: seed.agentName,
      rolePrompt: seed.rolePrompt[locale],
      allowedTools: [...seed.allowedTools],
      skills: [],
    },
  }));
}

/**
 * Builds the divisions of a workspace created from an analysed app: the
 * default coordinator and audit layer around the divisions the analysis
 * proposed (after the user reviewed them). The app summary is added to the
 * coordinator's role so every plan starts from what the app already is.
 */
export function buildDivisionsFromProposals(
  locale: SeedLocale,
  proposals: OfficeDivisionProposal[],
  appSummary: string | null,
): OfficeDivisionInput[] {
  const defaults = buildDefaultDivisions(locale);
  const coordinator = defaults.find((division) => division.isCoordinator) as OfficeDivisionInput;
  const audit = defaults.find((division) => division.isAudit) as OfficeDivisionInput;
  const contextHeading = locale === 'en' ? '## About this app' : '## Tentang aplikasi ini';
  const withContext: OfficeDivisionInput = appSummary?.trim()
    ? { ...coordinator, agent: { ...coordinator.agent, rolePrompt: `${coordinator.agent.rolePrompt}\n\n${contextHeading}\n${appSummary.trim()}` } }
    : coordinator;

  return [
    withContext,
    ...proposals.map((proposal) => ({
      name: proposal.name,
      slug: proposal.slug,
      description: proposal.description,
      color: proposal.color,
      agent: { name: proposal.agentName, rolePrompt: proposal.rolePrompt, allowedTools: [], skills: [] },
    })),
    audit,
  ];
}
