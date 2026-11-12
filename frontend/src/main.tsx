import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { WalletProvider } from './wallet'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

createRoot(root).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
)
