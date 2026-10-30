import { TablePageSkeleton } from '@/components/page-skeletons'

export default function Loading() {
  return <TablePageSkeleton columns={5} rows={3} fold />
}
