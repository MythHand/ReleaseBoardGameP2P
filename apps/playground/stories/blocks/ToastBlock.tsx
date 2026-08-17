import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import Toast, { type ToastItem, ToastStack } from '@/blocks/Toast'
import { makeChat } from '@/mocks/chat'
import Message from '@/primitives/Message'
import { pick, useLang } from '../../Playground/lang'
import { TechButton } from '../controls/TechControls'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'
import styles from './ToastBlock.module.css'

// Всплывающая плашка и стопка из них. Плашка сама по себе — только подложка и
// приход/уход; что внутри, она не знает. Живая стопка показана в своём углу:
// кнопка «прислать» добавляет запись в список, и дальше стопка ведёт её сама.
const REPLIES = makeChat().filter((m) => !m.system && m.who)

export default function ToastBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.toasts, en: enCommon.toasts })
  const [items, setItems] = useState<ToastItem[]>([])

  const push = () =>
    setItems((prev) => {
      const m = REPLIES[prev.length % REPLIES.length]
      if (!m) return prev
      return [
        ...prev,
        {
          id: `t-${prev.length}`,
          node: <Message text={m.text} who={m.who} time={m.time} authorRole={m.role} />,
        },
      ]
    })

  return (
    <KitPage title="Toast" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Плашка — подложка и ничего сверх неё',
          en: 'The plate — a backdrop and nothing over it',
        })}
      >
        <KitCell
          caption={pick(lang, {
            ru: 'внутри — реплика чата, плашка её не подкрашивает',
            en: 'a chat reply inside; the plate does not tint it',
          })}
        >
          <div className={styles.one}>
            <Toast>
              <Message
                who="TabsOverSpaces"
                authorRole="host"
                time="20:14"
                text={pick(lang, { ru: 'ну что, ещё партию?', en: 'one more round?' })}
              />
            </Toast>
          </div>
        </KitCell>

        <KitCell
          caption={pick(lang, {
            ru: 'высота по содержимому: длинная реплика влезает целиком',
            en: 'height follows content: a long reply fits whole',
          })}
        >
          <div className={styles.one}>
            <Toast>
              <Message
                who="SyntaxSeagull_9000_x"
                authorRole="player"
                time="20:15"
                text={pick(lang, {
                  ru: 'слушай, а если он сыграет Cancel в ответ на мой DDoS — у меня же остаётся ещё Unicorn на руке, я правильно помню порядок?',
                  en: 'listen, if they answer my DDoS with a Cancel — I still have a Unicorn in hand, am I remembering the order right?',
                })}
              />
            </Toast>
          </div>
        </KitCell>
      </KitSection>

      <KitSection
        title={pick(lang, {
          ru: 'Стопка: до четырёх, снизу вверх, по 6 секунд',
          en: 'The stack: up to four, bottom-up, six seconds each',
        })}
      >
        {/* технический вызов — под заголовком, над самой сценой */}
        <div className={styles.controls}>
          <TechButton onClick={push}>{pick(lang, { ru: 'прислать', en: 'send' })}</TechButton>
        </div>

        <KitCell
          wide
          caption={pick(lang, {
            ru: 'жми несколько раз подряд: пятая вытесняет самую старую. Мышь над стопкой держит сроки',
            en: 'press a few times: the fifth evicts the oldest. A pointer over the stack holds the timers',
          })}
        >
          <div className={styles.stage}>
            <div className={styles.corner}>
              <ToastStack items={items} copy={copy} />
            </div>
          </div>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
