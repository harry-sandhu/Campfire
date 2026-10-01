import { Suspense } from "react";
import { TicketsView } from "../../../components/tickets-view";
import { Spinner } from "../../../components/ui";

export default function MyWorkPage() {
  return <Suspense fallback={<Spinner />}><TicketsView mine /></Suspense>;
}
