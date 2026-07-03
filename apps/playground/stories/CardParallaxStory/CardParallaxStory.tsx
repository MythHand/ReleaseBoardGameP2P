import { type CSSProperties, useState } from 'react'
import { CARD_CONTENT, CARDS, CATEGORIES } from '@/cards'
import CardParallax from '@/cards/CardParallax'
import type { CardContent } from '@/cards/content'
import Card from '@/primitives/Card'
import { pick, useLang } from '../../Playground/lang'
import styles from './CardParallaxStory.module.css'

// cards that have a code-composed (parallax) face built; others stay PNG
const PARALLAX_IDS = new Set(['release-frontend'])

// Page for developing the composed (parallax) card face. Cards with a built
// composed face (PARALLAX_IDS) render <CardParallax>; the rest stay PNG <Card>.
// The rig — name rail, authoring size beside its LOD, usage-size previews and
// the content panel — is where we tune one card at a time (Frontend first).

// authoring surface — native PNG proportion 368×515
const AUTHORING_W = 368

// the real widths the card is shown at elsewhere in the product
const PREVIEWS: { id: string; w: number; label: { ru: string; en: string } }[] = [
  { id: 'hand', w: 150, label: { ru: 'рука', en: 'hand' } },
  { id: 'release', w: 100, label: { ru: 'зона релиза', en: 'release zone' } },
  { id: 'release-compact', w: 72 / 1.4, label: { ru: 'релиз · компакт', en: 'release · compact' } },
]

export default function CardParallaxStory() {
  const { lang } = useLang()
  const [selectedId, setSelectedId] = useState(CARDS[0].id)
  const selected = CARDS.find((c) => c.id === selectedId) ?? CARDS[0]
  const accent = CATEGORIES[selected.category].accent
  const content: CardContent | undefined = CARD_CONTENT[selected.id]?.[lang]

  // render the composed face for parallax cards, the PNG face otherwise
  const renderFace = (w: number, interactive: boolean) =>
    PARALLAX_IDS.has(selected.id) ? (
      <CardParallax
        content={{ title: content?.title ?? selected.name, description: content?.effect ?? '' }}
        width={`${w}px`}
        interactive={interactive}
      />
    ) : (
      <Card card={selected} width={`${w}px`} interactive={interactive} />
    )

  const t = pick(lang, {
    ru: {
      hint: 'Наведи на авторскую карту — параллакс-наклон для настройки глубины. LOD справа и превью ниже — статичные, в реальных размерах.',
      authoring: 'авторский размер',
      usedAt: 'размеры использования',
      noContent: 'composed-содержимого пока нет — заполняется по мере работы над картой',
      title: 'заголовок',
      typeLine: 'тип',
      effect: 'эффект',
      flavor: 'флейвор',
    },
    en: {
      hint: 'Hover the authoring card — parallax tilt for tuning depth. The LOD on the right and previews below are static, at real sizes.',
      authoring: 'authoring size',
      usedAt: 'used at',
      noContent: 'no composed content yet — authored as card work proceeds',
      title: 'title',
      typeLine: 'type',
      effect: 'effect',
      flavor: 'flavor',
    },
  })

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.hint}>{t.hint}</span>
        <span className={styles.count}>{CARDS.length}</span>
      </div>

      <div className={styles.main}>
        <nav className={styles.rail}>
          {CARDS.map((card) => (
            <button
              type="button"
              key={card.id}
              className={card.id === selectedId ? styles.railOn : styles.railItem}
              style={{ '--accent': CATEGORIES[card.category].accent } as CSSProperties}
              onClick={() => setSelectedId(card.id)}
            >
              <span className={styles.railDot} />
              <span className={styles.railName}>{card.name}</span>
              {/* still a PNG stand-in — clears once the card gets composed content */}
              {!CARD_CONTENT[card.id] && <span className={styles.railTag}>png</span>}
            </button>
          ))}
        </nav>

        <div className={styles.stage} style={{ '--accent': accent } as CSSProperties}>
          <section className={styles.authoring}>
            <div className={styles.authoringCell}>
              <div className={styles.label}>
                {t.authoring} · {AUTHORING_W}×515
              </div>
              {renderFace(AUTHORING_W, true)}
            </div>
            <div className={styles.authoringCell}>
              <div className={styles.label}>LOD · {AUTHORING_W}×515</div>
              {renderFace(AUTHORING_W, false)}
            </div>
          </section>

          <section className={styles.block}>
            <div className={styles.label}>{t.usedAt}</div>
            <div className={styles.previews}>
              {PREVIEWS.map((p) => (
                <div key={p.id} className={styles.previewCell}>
                  {renderFace(p.w, false)}
                  <div className={styles.previewCap}>
                    {pick(lang, p.label)} · {Math.round(p.w)}px
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.block}>
            {content ? (
              <dl className={styles.content}>
                <dt>{t.title}</dt>
                <dd>{content.title}</dd>
                <dt>{t.typeLine}</dt>
                <dd>{content.typeLine}</dd>
                <dt>{t.effect}</dt>
                <dd>{content.effect}</dd>
                {content.flavor && (
                  <>
                    <dt>{t.flavor}</dt>
                    <dd>{content.flavor}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className={styles.noContent}>{t.noContent}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
