export const assistantReports = {
  kepatuhan_fkrtl: { menu: 'Capaian Kepatuhan FKRTL', path: '/kepatuhanfkrtl', label: 'Kepatuhan FKRTL' },
  antrol_fkrtl: { menu: 'Pemanfaatan Antrol FKRTL', path: '/antrolfkrtl', label: 'Antrean online FKRTL' },
  kepatuhan_fktp: { menu: 'Capaian Kepatuhan FKTP', path: '/kepatuhanfktp', label: 'Antrean online FKTP' },
  monitoring_laras: { menu: 'Monitoring LARAS', path: '/monitoring-laras', label: 'Monitoring LARAS' },
} as const;

export type AssistantReport = keyof typeof assistantReports;

/** Open existing reports only; never arbitrary URLs or administrative actions. */
export function resolveAssistantReport(report: unknown, session: { isAuthenticated: boolean; user: { sub?: string } | null }) {
  if (!session.isAuthenticated || !session.user?.sub) {
    throw new Error('Sesi berakhir. Masuk kembali ke SAPA sebelum membuka laporan.');
  }
  if (typeof report !== 'string' || !Object.hasOwn(assistantReports, report)) {
    throw new Error('Pilih laporan SAPA yang tersedia.');
  }
  return assistantReports[report as AssistantReport];
}
