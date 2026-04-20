import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { AgentSkillBanner } from '@/components/agent-skill-banner';
import { InstallMethodCards } from '@/components/install-method-cards';
import { ArchitectureDiagram } from '@/components/architecture-diagram';
import { AgentExecutionDiagram } from '@/components/agent-execution-diagram';

const mdxComponents = {
  ...defaultMdxComponents,
  Tab,
  Tabs,
  Callout,
  Step,
  Steps,
  Accordion,
  Accordions,
  MarkdownViewer,
  InstallMethodCards,
  ArchitectureDiagram,
  AgentExecutionDiagram,
};

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <AgentSkillBanner />
        <MDX components={mdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const title = page.data.title;
  const description = page.data.description ?? 'Harness Kit documentation';

  return {
    title,
    description,
    openGraph: {
      title: `${title} — Harness Kit`,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: `${title} — Harness Kit`,
      description,
    },
  };
}
