import { Nav } from '@/components/nav';
import { Hero } from '@/components/sections/hero';
import { ProblemSolution } from '@/components/sections/problem-solution';
import { Pricing } from '@/components/sections/pricing';
import { Cta } from '@/components/sections/cta';

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ProblemSolution />
        <Pricing />
        <Cta />
      </main>
    </>
  );
}
