import { redirect } from 'next/navigation';

export default function ApprovalsRedirect() {
  redirect('/dashboard/marketing/contracts');
}
