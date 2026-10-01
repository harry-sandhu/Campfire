import { Suspense } from "react";
import { TicketsView } from "../../../components/tickets-view";
import { Spinner } from "../../../components/ui";

export default function TicketsPage() {
  return <Suspense fallback={<Spinner />}><TicketsView /></Suspense>;
}
