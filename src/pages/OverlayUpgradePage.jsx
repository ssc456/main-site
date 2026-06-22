import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

export default function OverlayUpgradePage() {
  const { siteKey } = useParams();
  const [searchParams] = useSearchParams();
  const [site, setSite] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState('');

  const returnUrl = searchParams.get('returnUrl') || '';
  const canceled = searchParams.get('canceled') === '1';

  useEffect(() => {
    let isMounted = true;

    async function loadSite() {
      try {
        setLoading(true);
        const response = await fetch(`/api/external-sites?action=status&siteKey=${encodeURIComponent(siteKey)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load billing details');
        }

        if (isMounted) {
          setSite(data);
          setError('');
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || 'Failed to load billing details');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSite();
    return () => {
      isMounted = false;
    };
  }, [siteKey]);

  async function handleUpgrade(interval) {
    try {
      setCheckoutLoading(interval);
      setError('');

      const response = await fetch('/api/external-sites?action=checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteKey,
          interval,
          returnUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      window.location.assign(data.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError.message || 'Failed to start checkout');
      setCheckoutLoading('');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Entry Nets Billing</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Upgrade {site?.displayName || siteKey}</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-300">
              Remove the free-site banner from this externally hosted site while keeping billing and entitlement control inside Entry Nets.
            </p>
          </div>
          {returnUrl && (
            <a
              className="rounded-full border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              href={returnUrl}
            >
              Back to site
            </a>
          )}
        </div>

        {canceled && (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-amber-100">
            Checkout was canceled. Your site is still on the free tier.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-rose-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-slate-300">Loading billing details...</div>
        ) : site?.paymentTier === 'PREMIUM' ? (
          <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-10">
            <h2 className="text-2xl font-semibold text-white">This site is already premium</h2>
            <p className="mt-3 max-w-2xl text-slate-200">
              The overlay should no longer show after the external site refreshes or refetches its billing status.
            </p>
            <div className="mt-6 flex gap-3">
              {returnUrl && (
                <a className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950" href={returnUrl}>
                  Return to site
                </a>
              )}
              <Link className="rounded-full border border-slate-600 px-5 py-3 text-sm text-slate-100" to="/">
                Entry Nets home
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Monthly</p>
              <h2 className="mt-4 text-3xl font-semibold text-white">GBP {site?.monthlyPriceLabel}/month</h2>
              <ul className="mt-6 space-y-3 text-slate-300">
                <li>Remove the Entry Nets free-site overlay</li>
                <li>Keep the site design and code fully under your control</li>
                <li>Stripe billing remains centralized in Entry Nets</li>
              </ul>
              <button
                className="mt-8 w-full rounded-full bg-cyan-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                disabled={checkoutLoading !== ''}
                onClick={() => handleUpgrade('monthly')}
              >
                {checkoutLoading === 'monthly' ? 'Redirecting...' : 'Upgrade monthly'}
              </button>
            </article>

            <article className="rounded-3xl border border-slate-800 bg-white p-8 text-slate-950 shadow-2xl shadow-cyan-500/10">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700">Annual</p>
              <h2 className="mt-4 text-3xl font-semibold">GBP {site?.yearlyPriceLabel}/year</h2>
              <ul className="mt-6 space-y-3 text-slate-700">
                <li>Same overlay removal and centralized billing</li>
                <li>Better fit for stable client websites</li>
                <li>Simple entitlement state: FREE or PREMIUM</li>
              </ul>
              <button
                className="mt-8 w-full rounded-full bg-slate-950 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={checkoutLoading !== ''}
                onClick={() => handleUpgrade('yearly')}
              >
                {checkoutLoading === 'yearly' ? 'Redirecting...' : 'Upgrade annually'}
              </button>
            </article>
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5 text-sm text-slate-300">
          {site?.demoMode
            ? 'Demo billing mode is active, so the checkout button simulates a successful upgrade without contacting Stripe.'
            : 'Live billing mode is active, so checkout redirects to Stripe and the overlay state is updated by the Entry Nets webhook.'}
        </div>
      </div>
    </div>
  );
}