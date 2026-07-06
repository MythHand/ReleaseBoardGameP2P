// Preset ("stock") avatars for players — a fixed gallery that reuses card art:
// each preset is a card id whose background + dim panel + illustration fill a
// square Avatar. Assets and dim level come straight from PARALLAX_CARDS, so no
// files are duplicated here — this is only the ordered list + bilingual labels.

// One catalogue entry. `id` doubles as the source card id in PARALLAX_CARDS.
export interface PresetAvatarItem {
  id: string
  label: { ru: string; en: string }
}

export const PRESET_AVATARS: PresetAvatarItem[] = [
  { id: 'release-frontend', label: { ru: 'Фронтенд', en: 'Frontend' } },
  { id: 'attack-bug', label: { ru: 'Баг', en: 'Bug' } },
  { id: 'attack-security-bug', label: { ru: 'Секьюрити Баг', en: 'Security Bug' } },
  { id: 'attack-ddos', label: { ru: 'DDoS', en: 'DDoS' } },
  { id: 'attack-out-of-memory', label: { ru: 'Потеря памяти', en: 'Out of Memory' } },
  { id: 'defense-not-a-bug', label: { ru: 'Это не баг', en: 'Not a Bug' } },
  { id: 'defense-rubber-ducky', label: { ru: 'Уточка', en: 'Rubber Ducky' } },
  { id: 'defense-hotfix', label: { ru: 'Хотфикс', en: 'Hotfix' } },
  {
    id: 'defense-works-on-my-machine',
    label: { ru: 'У меня работает', en: 'Works on my Machine' },
  },
  { id: 'protection-debugger', label: { ru: 'Дебаггер', en: 'Debugger' } },
  { id: 'protection-monitoring', label: { ru: 'Мониторинг', en: 'Monitoring' } },
  { id: 'operation-git-cherry-pick', label: { ru: 'Гит Черипик', en: 'Git Cherry-pick' } },
  { id: 'support-sudo', label: { ru: 'Судо', en: 'Sudo' } },
  { id: 'support-code-review', label: { ru: 'Кодревью', en: 'Code Review' } },
  { id: 'trigger-error-503', label: { ru: 'Error 503', en: 'Error 503' } },
  { id: 'trigger-ai', label: { ru: 'AI', en: 'AI' } },
  { id: 'ai-good-vibe-coding', label: { ru: 'Гуд Вайбкодинг', en: 'Good Vibe-Coding' } },
  { id: 'ai-hallucination', label: { ru: 'Галлюцинации', en: 'Hallucination' } },
  { id: 'ai-inside', label: { ru: 'Инсайд', en: 'Inside' } },
]
