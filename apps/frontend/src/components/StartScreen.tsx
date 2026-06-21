import { useTranslation } from 'react-i18next'
import { Start, type StartCopy } from '@release/ui'

export function StartScreen() {
  const { t } = useTranslation()
  const copy: StartCopy = {
    logoAlt: t('start.logoAlt'),
    tags: [t('start.tagOpenP2P'), t('start.tagBoardCard')],
    description: t('start.description'),
    createGame: t('start.createGame'),
    joinGame: t('start.joinGame'),
    videoReview: t('start.videoReview'),
    close: t('start.close'),
    createTitle: t('start.createTitle'),
    createStub: t('start.createStub'),
    createCta: t('start.createCta'),
    joinTitle: t('start.joinTitle'),
    gameCodeLabel: t('start.gameCodeLabel'),
    gameCodePlaceholder: t('start.gameCodePlaceholder'),
    joinCta: t('start.joinCta'),
  }
  return <Start copy={copy} />
}
