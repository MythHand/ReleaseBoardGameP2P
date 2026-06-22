import Start from '@/screens/Start'
import { RU_MODES } from '../ru-copy'
import styles from './StartStory.module.css'

export default function StartStory() {
  return (
    <div className={styles.root}>
      <Start
        copy={{
          logoAlt: 'Release любой ценой',
          tags: ['Открытый P2P-проект', 'По настольной карточной игре'],
          description:
            'Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные события, атаки соперников — преодолевай всё это и зарелизь первым.',
          createGame: 'создать игру',
          joinGame: 'подключиться',
          rules: 'правила',
          github: 'GitHub',
          videoReview: 'видео-обзор',
          close: 'закрыть',
          createTitle: 'Создать игру',
          lobbyParams: 'Параметры лобби',
          nicknameLabel: 'Ваш никнейм',
          nicknamePlaceholder: 'напр. dimbo',
          createCta: 'создать лобби',
          lobbyNote:
            'Лимит игроков и режимы партии настраиваются уже в лобби — пересоздавать ничего не нужно.',
          joinTitle: 'Подключиться',
          gameCodeLabel: 'код игры',
          gameCodePlaceholder: 'напр. 4F2A-9K',
          joinCta: 'войти',
          rulesTitle: 'Правила',
          modes: RU_MODES,
        }}
      />
    </div>
  )
}
