import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ProfileDetail } from '@/components/marketplace/ProfileDetail';
import { getAllProfiles, getProfile, getRepoStars } from '@/lib/marketplace/data';

export function generateStaticParams() {
  return getAllProfiles().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const profile = getProfile(slug);
  if (!profile) return { title: 'Profile not found — Harness Kit' };
  return {
    title: `${profile.persona} Profile — Harness Kit Marketplace`,
    description: profile.description,
  };
}

export default async function ProfileDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const profile = getProfile(slug);
  if (!profile) notFound();

  // Inject repo-level stars onto the profile, same as the landing page does for cards.
  // The generator writes repoStars at the MarketplaceData level, not per-profile.
  const stars = getRepoStars();
  const profileWithStars = stars !== undefined ? { ...profile, stars } : profile;

  return (
    <main className="min-h-screen">
      <SiteNav />
      <ProfileDetail profile={profileWithStars} />
      <SiteFooter />
    </main>
  );
}
