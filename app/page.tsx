import type { Metadata } from "next";
import WeddingExperience from "./WeddingExperience";

export const metadata: Metadata = {
  title: "Ekaterina & Dimitar | 20 June 2027",
  description: "A personal invitation to celebrate with us at Midalidare Estate.",
};

export default function Home() {
  return <WeddingExperience />;
}
