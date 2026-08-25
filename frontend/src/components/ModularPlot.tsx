import Plot from 'react-plotly.js';
import type { DashboardStats } from '../hooks/useDashboardData';

interface ModularPlotProps {
  data: DashboardStats;
  type: 'trend' | 'bar';
}

export default function ModularPlot({ data, type }: ModularPlotProps) {
  if (type === 'trend') {
    return (
      <Plot
        data={[
          {
            x: data.trend_per_bulan.filter(d => d.Sumber === "All Sumber").map(d => d.BulanTahun),
            y: data.trend_per_bulan.filter(d => d.Sumber === "All Sumber").map(d => d.AvgCapaian),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'All Sumber',
            line: { color: '#06b6d4', width: 3 },
          },
          {
            x: data.trend_per_bulan.filter(d => d.Sumber === "Mobile JKN").map(d => d.BulanTahun),
            y: data.trend_per_bulan.filter(d => d.Sumber === "Mobile JKN").map(d => d.AvgCapaian),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Mobile JKN',
            line: { color: '#3b82f6', width: 3 },
          }
        ]}
        layout={{
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#cbd5e1' },
          margin: { t: 10, r: 10, l: 40, b: 40 },
          xaxis: { showgrid: false },
          yaxis: { gridcolor: '#334155' },
          legend: { orientation: 'h', y: -0.2 }
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '350px' }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  }

  // Top Faskes Bar chart
  return (
    <Plot
      data={[
        {
          x: data.top_faskes.map(d => d.AvgCapaian),
          y: data.top_faskes.map(d => d.Faskes),
          type: 'bar',
          orientation: 'h',
          marker: { color: '#0ea5e9' }
        }
      ]}
      layout={{
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cbd5e1' },
        margin: { t: 10, r: 10, l: 150, b: 40 },
        xaxis: { gridcolor: '#334155' },
        yaxis: { autorange: 'reversed' }
      }}
      useResizeHandler={true}
      style={{ width: '100%', height: '350px' }}
      config={{ responsive: true, displayModeBar: false }}
    />
  );
}
