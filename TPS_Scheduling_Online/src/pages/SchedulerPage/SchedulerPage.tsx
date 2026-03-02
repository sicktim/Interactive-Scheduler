import { useState, useCallback, useEffect } from 'react';
import type { ScheduleEvent, Roster, ScreenState } from '../../types';
import type { WorkingCopyData } from '../../utils';
import {
  transformBatchData, mergeDuplicateEvents, loadWorkingCopy, clearWorkingCopy,
  loadState, eventNaturalKey,
} from '../../utils';
import { fetchRoster, fetchBatch } from '../../services/api';
import { SAMPLE_ROSTER } from '../../data/sampleRoster';
import { SAMPLE_DATES } from '../../data/sampleDates';
import { buildSampleEvents } from '../../data/buildSampleEvents';
import { LoadingScreen } from '../../components/shared/LoadingScreen/LoadingScreen';
import { EventSelectionScreen } from '../../components/scheduler/EventSelectionScreen/EventSelectionScreen';
import { SchedulerView } from '../../components/scheduler/SchedulerView/SchedulerView';

export default function SchedulerPage() {
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [allEvents, setAllEvents] = useState<ScheduleEvent[]>([]);
  const [roster, setRoster] = useState<Roster>({});
  const [dates, setDates] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [naCats, setNaCats] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [cachedWorkingState, setCachedWorkingState] = useState<WorkingCopyData | null>(null);

  const filterRoster = (raw: Roster): Roster => {
    const filtered: Roster = {};
    Object.entries(raw).forEach(([k, v]) => { if (v?.length > 0) filtered[k] = v; });
    return filtered;
  };

  const refreshFromWhiteboard = useCallback(async (mode: 'quick' | 'full') => {
    clearWorkingCopy();
    setCachedWorkingState(null);
    setScreen('loading');

    const savedSelections = loadState();

    try {
      setProgress(mode === 'full'
        ? 'Full refresh from Whiteboard 2.0 (this may take ~1 min)...'
        : 'Quick refresh...');

      const [rosterRes, batchRes] = await Promise.all([
        fetchRoster(),
        fetchBatch(mode === 'full'),
      ]);

      const loadedRoster = rosterRes.roster;
      const loadedDates = batchRes.days.map(d => d.isoDate);
      const loadedEvents = mergeDuplicateEvents(transformBatchData(batchRes, loadedRoster), loadedRoster);

      setRoster(filterRoster(loadedRoster));
      setDates(loadedDates);
      setAllEvents(loadedEvents);

      // Restore selections by natural key
      if (savedSelections?.selectedKeys?.length) {
        const keySet = new Set(savedSelections.selectedKeys);
        const matchedIds = new Set<string>();
        loadedEvents.forEach(ev => {
          if (keySet.has(eventNaturalKey(ev))) matchedIds.add(ev.id);
        });
        if (matchedIds.size > 0) {
          setSelectedIds(matchedIds);
          setNaCats(savedSelections.naCats || new Set());
          setScreen('scheduler');
          return;
        }
      }

      setScreen('selection');
    } catch (err) {
      setError('Refresh failed: ' + (err as Error).message);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        // Check for saved working copy first
        const cached = loadWorkingCopy();
        if (cached && cached.workingEvents.length > 0) {
          setProgress('Restoring from local cache...');
          setRoster(filterRoster(cached.roster));
          setDates(cached.dates);
          setAllEvents(cached.allEvents);
          setSelectedIds(cached.selectedIds);
          setNaCats(cached.naCats);
          setCachedWorkingState(cached);
          setScreen('scheduler');
          return;
        }

        setProgress('Fetching schedule data...');
        let loadedRoster: Roster;
        let loadedEvents: ScheduleEvent[];
        let loadedDates: string[];

        try {
          const [rosterRes, batchRes] = await Promise.all([
            fetchRoster(),
            fetchBatch(),
          ]);
          loadedRoster = rosterRes.roster;
          loadedDates = batchRes.days.map(d => d.isoDate);
          loadedEvents = mergeDuplicateEvents(transformBatchData(batchRes, loadedRoster), loadedRoster);
        } catch (apiErr) {
          console.warn('API failed, using sample data:', (apiErr as Error).message);
          setProgress('Using sample data...');
          loadedRoster = SAMPLE_ROSTER;
          loadedDates = SAMPLE_DATES;
          loadedEvents = buildSampleEvents();
        }

        setRoster(filterRoster(loadedRoster));
        setDates(loadedDates);
        setAllEvents(loadedEvents);

        // Check for saved state (selections from previous session)
        const saved = loadState();
        if (saved?.selectedKeys?.length) {
          const keySet = new Set(saved.selectedKeys);
          const matchedIds = new Set<string>();
          loadedEvents.forEach(ev => {
            if (keySet.has(eventNaturalKey(ev))) matchedIds.add(ev.id);
          });
          if (matchedIds.size > 0) {
            setSelectedIds(matchedIds);
            setNaCats(saved.naCats || new Set());
            setScreen('scheduler');
            return;
          }
        }

        setScreen('selection');
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, []);

  const handleContinue = (ids: Set<string>, cats: Set<string>) => {
    setSelectedIds(ids);
    setNaCats(cats);
    setScreen('scheduler');
  };

  if (error) {
    return (
      <div className="loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>Error</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', background: '#2563eb', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'loading') return <LoadingScreen progress={progress} />;

  if (screen === 'selection') {
    return (
      <EventSelectionScreen
        allEvents={allEvents}
        roster={roster}
        dates={dates}
        onContinue={handleContinue}
        initialSelected={selectedIds}
        initialNaCats={naCats}
      />
    );
  }

  return (
    <SchedulerView
      allEvents={allEvents}
      roster={roster}
      dates={dates}
      initialSelectedIds={selectedIds}
      initialNaCats={naCats}
      onChangeSelection={() => { clearWorkingCopy(); setScreen('selection'); }}
      cachedWorkingState={cachedWorkingState}
      onRefreshFromWhiteboard={refreshFromWhiteboard}
    />
  );
}
