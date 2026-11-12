import { DEPLOYER, NAMESPACE, PERMIT2, WBNB, contracts } from '../config'
import { AddressLine } from '../ui'

const GROUPS: { title: string; rows: { label: string; value: string }[] }[] = [
  {
    title: 'Vault',
    rows: [
      { label: 'Deployer', value: DEPLOYER },
      { label: 'Namespace deployer', value: contracts.namespaceDeployer },
      { label: 'Vault', value: contracts.vault },
      { label: 'Vault admin', value: contracts.vaultAdmin },
      { label: 'Vault extension', value: contracts.vaultExtension },
      { label: 'Explorer', value: contracts.vaultExplorer },
    ],
  },
  {
    title: 'Routers',
    rows: [
      { label: 'Router', value: contracts.router },
      { label: 'Batch router', value: contracts.batchRouter },
      { label: 'Buffer router', value: contracts.bufferRouter },
      { label: 'Composite router', value: contracts.compositeLiquidityRouter },
    ],
  },
  {
    title: 'Factories',
    rows: [
      { label: 'Vault factory', value: contracts.vaultFactory },
      { label: 'Weighted factory', value: contracts.weightedPoolFactory },
      { label: 'Stable factory', value: contracts.stablePoolFactory },
      { label: 'Authorizer', value: contracts.authorizer },
      { label: 'Fee controller', value: contracts.protocolFeeController },
    ],
  },
  {
    title: 'Tokens',
    rows: [
      { label: 'WBNB', value: WBNB },
      { label: 'Permit2', value: PERMIT2 },
    ],
  },
]

export function ProtocolView() {
  return (
    <section className="sheet wide">
      <header className="sheet-head">
        <div>
          <p className="kicker">{NAMESPACE}</p>
          <h1>Deployment</h1>
        </div>
      </header>
      <p className="lede">
        Owned by {DEPLOYER} under {NAMESPACE}. These addresses are that key’s CREATE2 vault. Routers include BSC Testnet WBNB.
      </p>
      {GROUPS.map((group) => (
        <div key={group.title} className="group">
          <h2>{group.title}</h2>
          {group.rows.map((row) => (
            <AddressLine key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      ))}
    </section>
  )
}
