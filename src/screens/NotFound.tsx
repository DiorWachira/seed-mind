import { useT } from '../ui/i18n';

/** 404: an empty pit. */
export function NotFound({ path }: { path: string }) {
  const t = useT();
  return (
    <div className="empty-state" data-tour="not-found">
      <div className="empty-pit" aria-hidden="true"><span /></div>
      <div className="stack" style={{ gap: 14, maxWidth: 560 }}>
        <p className="lbl">{t('Error 404 · empty pit')}</p>
        <h1 className="disp" style={{ fontSize: 'clamp(36px, 5vw, 60px)', lineHeight: 1.04 }}>{t('Nothing was sown here.')}</h1>
        <p className="muted" style={{ fontSize: 18, lineHeight: 1.55 }}>{t('There is no page at {path}. The sowing ended in an empty pit, so the turn is over.', { path: `#${path}` })}</p>
        <div className="row"><a className="btn go" href="#/">{t('Back to the overview')}</a><a className="btn" href="#/play">{t('Play a game')}</a></div>
      </div>
    </div>
  );
}
