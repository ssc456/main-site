import { Link, useSearchParams } from 'react-router-dom';

export default function OverlayUpgradeSuccess() {
  const [searchParams] = useSearchParams();
  const siteKey = searchParams.get('siteKey') || 'site';
  const returnUrl = searchParams.get('returnUrl') || '';
  const isDemo = searchParams.get('demo') === '1';

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-10 shadow-2xl shadow-emerald-950/30">
        <p className="text-sm uppercase tracking-[0.35em] text-emerald-200">Upgrade complete</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">{siteKey} is now premium</h1>
        <p className="mt-4 text-lg text-emerald-50/90">
          {isDemo
            ? 'This was a demo upgrade, so the site entitlement was flipped immediately by the Entry Nets API.'
            : 'Stripe has completed successfully. The overlay will disappear after the external site refreshes its billing status.'}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {returnUrl && (
            <a className="rounded-full bg-white px-5 py-3 font-medium text-slate-950" href={returnUrl}>
              Return to site
            </a>
          )}
          <Link className="rounded-full border border-white/30 px-5 py-3 text-white" to={`/upgrade/${encodeURIComponent(siteKey)}`}>
            View billing page
          </Link>
        </div>
      </div>
    </div>
  );
}