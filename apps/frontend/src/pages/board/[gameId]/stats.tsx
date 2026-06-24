import { useTranslation } from '@release/translation'
import { Stats, type StatsCopy } from '@release/ui'

export default function StatsPage() {
  const { t } = useTranslation()
  const copy: StatsCopy = {
    title: t('stats.title'),
    subtitle: t('stats.subtitle'),
    winnerLabel: t('stats.winnerLabel'),
    winnerTag: t('stats.winnerTag'),
    colName: t('stats.colName'),
    colLoc: t('stats.colLoc'),
    colAttack: t('stats.colAttack'),
    colDefense: t('stats.colDefense'),
    toLobby: t('stats.toLobby'),
    location: {
      game: t('stats.location.game'),
      stats: t('stats.location.stats'),
      lobby: t('stats.location.lobby'),
      offline: t('stats.location.offline'),
    },
    achievements: {
      ddos: { title: t('stats.achievements.ddos.title'), unit: t('stats.achievements.ddos.unit') },
      ai: { title: t('stats.achievements.ai.title'), unit: t('stats.achievements.ai.unit') },
      err503: {
        title: t('stats.achievements.err503.title'),
        unit: t('stats.achievements.err503.unit'),
      },
      cherryPick: {
        title: t('stats.achievements.cherryPick.title'),
        unit: t('stats.achievements.cherryPick.unit'),
      },
      attackedInto: {
        title: t('stats.achievements.attackedInto.title'),
        unit: t('stats.achievements.attackedInto.unit'),
      },
    },
  }
  return (
    <div data-testid="stats-page">
      <Stats winnerId="" copy={copy} />
    </div>
  )
}
