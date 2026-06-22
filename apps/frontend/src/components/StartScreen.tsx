import { Start, type StartCopy } from '@release/ui'
import { useTranslation } from 'react-i18next'

export function StartScreen() {
  const { t } = useTranslation()
  const copy: StartCopy = {
    logoAlt: t('start.logoAlt'),
    tags: [t('start.tagOpenP2P'), t('start.tagBoardCard')],
    description: t('start.description'),
    createGame: t('start.createGame'),
    joinGame: t('start.joinGame'),
    rules: t('start.rules'),
    github: t('start.github'),
    videoReview: t('start.videoReview'),
    close: t('start.close'),
    createTitle: t('start.createTitle'),
    lobbyParams: t('start.lobbyParams'),
    nicknameLabel: t('start.nicknameLabel'),
    nicknamePlaceholder: t('start.nicknamePlaceholder'),
    createCta: t('start.createCta'),
    lobbyNote: t('start.lobbyNote'),
    joinTitle: t('start.joinTitle'),
    gameCodeLabel: t('start.gameCodeLabel'),
    gameCodePlaceholder: t('start.gameCodePlaceholder'),
    joinCta: t('start.joinCta'),
    rulesTitle: t('start.rulesTitle'),
  }
  return <Start copy={copy} />
}
