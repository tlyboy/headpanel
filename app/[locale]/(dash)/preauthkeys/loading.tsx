import { TablePageSkeleton } from '@/components/page-skeletons'

export default function Loading() {
  return <TablePageSkeleton columns={7} rows={3} action fold />
}
