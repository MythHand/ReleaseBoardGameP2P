// Preset ("stock") avatars for players — a fixed gallery that reuses card art:
// each card preset is a card id whose background + dim panel + illustration fill
// a square Avatar. Assets and dim level come straight from PARALLAX_CARDS, so no
// files are duplicated here — this is only the ordered list + bilingual labels.
// The Bug Runner presets at the start are the exception: their layers are
// images of their own (bugRunner.ts).

// One catalogue entry. `id` is the source card id in PARALLAX_CARDS, or a key of
// BUG_RUNNER_AVATARS.
export interface PresetAvatarItem {
  id: string
  label: { ru: string; en: string }
}

export const PRESET_AVATARS: PresetAvatarItem[] = [
  // the lobby mini-game's pixel art (bugRunner.ts), not a card — first in the grid
  { id: 'bug-runner-bug', label: { ru: 'Пиксельный Баг', en: 'Pixel Bug' } },
  { id: 'bug-runner-server', label: { ru: 'Пиксельный Сервер', en: 'Pixel Server' } },
  { id: 'bug-runner-hotfix', label: { ru: 'Пиксельный Хотфикс', en: 'Pixel Hotfix' } },
  { id: 'bug-runner-monitoring', label: { ru: 'Пиксельный Мониторинг', en: 'Pixel Monitoring' } },
  { id: 'release-frontend', label: { ru: 'Фронтенд', en: 'Frontend' } },
  { id: 'release-backend', label: { ru: 'Бэкенд', en: 'Backend' } },
  { id: 'release-database', label: { ru: 'База данных', en: 'Database' } },
  { id: 'attack-bug', label: { ru: 'Баг', en: 'Bug' } },
  { id: 'attack-security-bug', label: { ru: 'Секьюрити Баг', en: 'Security Bug' } },
  { id: 'attack-ddos', label: { ru: 'DDoS', en: 'DDoS' } },
  { id: 'attack-out-of-memory', label: { ru: 'Потеря памяти', en: 'Out of Memory' } },
  { id: 'attack-legacy-code', label: { ru: 'Легаси Код', en: 'Legacy Code' } },
  { id: 'defense-not-a-bug', label: { ru: 'Это не баг', en: 'Not a Bug' } },
  { id: 'defense-rubber-ducky', label: { ru: 'Уточка', en: 'Rubber Ducky' } },
  { id: 'defense-hotfix', label: { ru: 'Хотфикс', en: 'Hotfix' } },
  {
    id: 'defense-works-on-my-machine',
    label: { ru: 'У меня работает', en: 'Works on my Machine' },
  },
  { id: 'defense-rollback', label: { ru: 'Роллбэк', en: 'Rollback' } },
  { id: 'defense-pr-approved', label: { ru: 'PR Апрув', en: 'PR Approved' } },
  { id: 'protection-debugger', label: { ru: 'Дебаггер', en: 'Debugger' } },
  { id: 'protection-monitoring', label: { ru: 'Мониторинг', en: 'Monitoring' } },
  { id: 'operation-git-cherry-pick', label: { ru: 'Гит Черипик', en: 'Git Cherry-pick' } },
  { id: 'operation-git-branch', label: { ru: 'Гит Бранч', en: 'Git Branch' } },
  { id: 'operation-git-merge', label: { ru: 'Гит Мёрдж', en: 'Git Merge' } },
  { id: 'operation-git-rebase', label: { ru: 'Гит Ребейз', en: 'Git Rebase' } },
  { id: 'operation-system-upgrade', label: { ru: 'Апгрейд системы', en: 'System Upgrade' } },
  { id: 'support-sudo', label: { ru: 'Судо', en: 'Sudo' } },
  { id: 'support-code-review', label: { ru: 'Кодревью', en: 'Code Review' } },
  { id: 'trigger-error-503', label: { ru: 'Error 503', en: 'Error 503' } },
  { id: 'trigger-ai', label: { ru: 'AI', en: 'AI' } },
  { id: 'ai-good-vibe-coding', label: { ru: 'Гуд Вайбкодинг', en: 'Good Vibe-Coding' } },
  { id: 'ai-bad-vibe-coding', label: { ru: 'Бэд Вайбкодинг', en: 'Bad Vibe-Coding' } },
  { id: 'ai-hallucination', label: { ru: 'Галлюцинации', en: 'Hallucination' } },
  { id: 'ai-inside', label: { ru: 'Инсайд', en: 'Inside' } },
  { id: 'ai-monitoring', label: { ru: 'AI Мониторинг', en: 'AI Monitoring' } },
]
