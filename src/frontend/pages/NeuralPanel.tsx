import { useState, useEffect, type CSSProperties } from 'react'
import { useStore } from '@/store'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Brain, Cpu, Zap } from 'lucide-react'

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  overview: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  } as CSSProperties,
  overviewLeft: { display: 'flex', alignItems: 'center', gap: 16 } as CSSProperties,
  stat: { fontSize: 13, color: 'var(--text-muted)' } as CSSProperties,
  statValue: { color: 'var(--text-primary)', fontWeight: 600 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } as CSSProperties,
  modelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 } as CSSProperties,
  modelCard: {
    padding: 16, background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 10,
  } as CSSProperties,
  modelName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' } as CSSProperties,
  modelMeta: { fontSize: 12, color: 'var(--text-muted)' } as CSSProperties,
  progressBar: {
    width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden',
  } as CSSProperties,
  progressFill: {
    height: '100%', borderRadius: 3, transition: 'width 0.3s ease',
  } as CSSProperties,
  label: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' } as CSSProperties,
  select: {
    width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg-input)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    outline: 'none',
  } as CSSProperties,
  textarea: {
    width: '100%', minHeight: 100, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font-mono)',
    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
  } as CSSProperties,
  row: { display: 'flex', gap: 8, marginTop: 12 } as CSSProperties,
  resultBox: {
    padding: 16, background: 'var(--bg-input)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', marginTop: 12, fontFamily: 'var(--font-mono)',
    fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 200,
    overflow: 'auto',
  } as CSSProperties,
  patternGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 } as CSSProperties,
  patternCard: {
    padding: 12, background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  } as CSSProperties,
  patternName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' } as CSSProperties,
  patternType: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } as CSSProperties,
  actionsRow: { display: 'flex', gap: 8, marginTop: 12 } as CSSProperties,
  empty: { fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' } as CSSProperties,
  trainingIndicator: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-blue)',
    borderRadius: 'var(--radius)', marginTop: 12,
  } as CSSProperties,
  spinner: {
    width: 16, height: 16, border: '2px solid var(--border)',
    borderTopColor: 'var(--accent-blue)', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', flexShrink: 0,
  } as CSSProperties,
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.9) return 'var(--accent-green)'
  if (accuracy >= 0.7) return 'var(--accent-yellow)'
  return 'var(--accent-red)'
}

export default function NeuralPanel() {
  const { neural, setNeural } = useStore()
  const [loading, setLoading] = useState('')
  const [trainModel, setTrainModel] = useState('')
  const [trainData, setTrainData] = useState('')
  const [predictModel, setPredictModel] = useState('')
  const [predictInput, setPredictInput] = useState('')
  const [predictResult, setPredictResult] = useState<unknown>(null)
  const [patterns, setPatterns] = useState<Array<{ name: string; type: string }>>([])
  const [isTraining, setIsTraining] = useState(false)

  const models = neural?.models || []

  useEffect(() => {
    api.neural.status().then((data: unknown) => setNeural(data as Parameters<typeof setNeural>[0])).catch(() => {})
    api.neural.patterns().then((data: unknown) => setPatterns(Array.isArray(data) ? data : ((data as { patterns?: Array<{ name: string; type: string }> }).patterns ?? []))).catch(() => {})
  }, [])

  useEffect(() => {
    if (models.length > 0 && !trainModel) setTrainModel(models[0].name)
    if (models.length > 0 && !predictModel) setPredictModel(models[0].name)
  }, [models])

  async function handleTrain() {
    if (!trainModel) return
    setLoading('train')
    setIsTraining(true)
    try {
      let data: unknown = undefined
      if (trainData.trim()) {
        data = JSON.parse(trainData)
      }
      await api.neural.train({ model: trainModel, data })
      const status = await api.neural.status()
      setNeural(status as Parameters<typeof setNeural>[0])
    } catch { /* noop */ }
    setIsTraining(false)
    setLoading('')
  }

  async function handlePredict() {
    if (!predictModel || !predictInput.trim()) return
    setLoading('predict')
    try {
      const input = JSON.parse(predictInput)
      const result = await api.neural.predict({ model: predictModel, input })
      setPredictResult(result)
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleOptimize() {
    setLoading('optimize')
    try {
      await api.neural.optimize()
      const status = await api.neural.status()
      setNeural(status as Parameters<typeof setNeural>[0])
    } catch { /* noop */ }
    setLoading('')
  }

  async function handleCompress() {
    setLoading('compress')
    try {
      await api.neural.compress()
      const status = await api.neural.status()
      setNeural(status as Parameters<typeof setNeural>[0])
    } catch { /* noop */ }
    setLoading('')
  }

  const chartData = models.map((m) => ({
    name: m.name,
    accuracy: Math.round(m.accuracy * 100),
  }))

  return (
    <div style={s.page}>
      {/* Status Overview */}
      <div style={s.overview}>
        <div style={s.overviewLeft}>
          <Brain size={20} color="var(--accent-blue)" />
          <StatusBadge status={neural?.enabled ? 'active' : 'inactive'} />
          <span style={s.stat}>Models: <span style={s.statValue}>{models.length}</span></span>
          <span style={s.stat}>Training Queue: <span style={s.statValue}>{neural?.trainingQueue ?? 0}</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={handleOptimize} loading={loading === 'optimize'}>
            <Zap size={14} /> Optimize
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCompress} loading={loading === 'compress'}>
            <Cpu size={14} /> Compress
          </Button>
        </div>
      </div>

      {/* Models Section */}
      <Card title="Models" actions={
        <Button size="sm" variant="secondary" onClick={() => {
          api.neural.status().then((data: unknown) => setNeural(data as Parameters<typeof setNeural>[0])).catch(() => {})
        }}>Refresh</Button>
      }>
        {models.length === 0 && <p style={s.empty}>No models available</p>}
        <div style={s.modelGrid}>
          {models.map((model) => (
            <div key={model.name} style={s.modelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={s.modelName}>{model.name}</span>
                <StatusBadge status={model.status} size="sm" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={s.modelMeta}>Accuracy</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: accuracyColor(model.accuracy) }}>
                    {Math.round(model.accuracy * 100)}%
                  </span>
                </div>
                <div style={s.progressBar}>
                  <div style={{
                    ...s.progressFill,
                    width: `${Math.round(model.accuracy * 100)}%`,
                    background: accuracyColor(model.accuracy),
                  }} />
                </div>
              </div>
              {model.lastTrained && (
                <span style={s.modelMeta}>Last trained: {new Date(model.lastTrained).toLocaleDateString()}</span>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" onClick={() => { setTrainModel(model.name) }}>Train</Button>
                <Button size="sm" variant="secondary" onClick={() => { setPredictModel(model.name) }}>Predict</Button>
              </div>
            </div>
          ))}
        </div>
        {/* Accuracy chart */}
        {chartData.length > 0 && (
          <div style={{ height: 200, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                  formatter={(value: number) => [`${value}%`, 'Accuracy']}
                />
                <Bar dataKey="accuracy" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div style={s.grid}>
        {/* Training Section */}
        <Card title="Training">
          <label style={s.label}>Model</label>
          <select style={s.select} value={trainModel} onChange={(e) => setTrainModel(e.target.value)}>
            {models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
          <label style={{ ...s.label, marginTop: 12 }}>Training Data (JSON)</label>
          <textarea
            style={s.textarea as CSSProperties}
            value={trainData}
            onChange={(e) => setTrainData(e.target.value)}
            placeholder='{"features": [...], "labels": [...]}'
          />
          <div style={s.row}>
            <Button onClick={handleTrain} loading={loading === 'train'} disabled={!trainModel}>Start Training</Button>
          </div>
          {isTraining && (
            <div style={s.trainingIndicator}>
              <div style={s.spinner} />
              <span style={{ fontSize: 13, color: 'var(--accent-blue)' }}>Training in progress...</span>
            </div>
          )}
        </Card>

        {/* Prediction Section */}
        <Card title="Prediction">
          <label style={s.label}>Model</label>
          <select style={s.select} value={predictModel} onChange={(e) => setPredictModel(e.target.value)}>
            {models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
          <label style={{ ...s.label, marginTop: 12 }}>Input (JSON)</label>
          <textarea
            style={s.textarea as CSSProperties}
            value={predictInput}
            onChange={(e) => setPredictInput(e.target.value)}
            placeholder='{"input": [1, 2, 3]}'
          />
          <div style={s.row}>
            <Button onClick={handlePredict} loading={loading === 'predict'} disabled={!predictModel || !predictInput.trim()}>
              Predict
            </Button>
          </div>
          {predictResult !== null && (
            <div style={s.resultBox}>
              {typeof predictResult === 'string' ? predictResult : JSON.stringify(predictResult, null, 2)}
            </div>
          )}
        </Card>
      </div>

      {/* Patterns Section */}
      <Card title="Patterns" actions={
        <Button size="sm" variant="secondary" onClick={() => {
          api.neural.patterns().then((data: unknown) => setPatterns(Array.isArray(data) ? data : ((data as { patterns?: Array<{ name: string; type: string }> }).patterns ?? []))).catch(() => {})
        }}>Refresh</Button>
      }>
        {patterns.length === 0 && <p style={s.empty}>No patterns detected</p>}
        <div style={s.patternGrid}>
          {patterns.map((p, i) => (
            <div key={i} style={s.patternCard}>
              <div style={s.patternName}>{p.name}</div>
              <div style={s.patternType}>{p.type}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
