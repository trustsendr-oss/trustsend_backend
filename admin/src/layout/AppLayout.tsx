import { Layout } from 'react-admin'
import type { LayoutProps } from 'react-admin'
import { TumaAppBar } from './AppBar'
import { AppMenu } from './AppMenu'

export function AppLayout(props: LayoutProps) {
  return <Layout {...props} appBar={TumaAppBar} menu={AppMenu} />
}
