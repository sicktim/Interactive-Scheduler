import type { SheetReturn } from '../types';

export const SAMPLE_SHEET: SheetReturn = {
  schedule: [
    { section: 'Supervision', time: '07:15', details: { duty: 'SOF', startTime: '07:15', endTime: '12:00' }, personnel: ['Coleman'] },
    { section: 'Supervision', time: '06:30', details: { duty: 'OS', startTime: '06:30', endTime: '12:45' }, personnel: ['Fitzgerald'] },
    { section: 'Supervision', time: '12:45', details: { duty: 'OS', startTime: '12:45', endTime: '17:00' }, personnel: ['Borek'] },
    { section: 'Supervision', time: '06:30', details: { duty: 'ODO', startTime: '06:30', endTime: '16:00' }, personnel: ['Bernstein'] },
    { section: 'Flying', time: '08:15', details: { model: 'F-16', eventName: 'STRUCTURES EE (FQ7230)', briefTime: '08:15', etd: '10:45', eta: '12:15', debriefEnd: '13:15', notes: 'FALSE' }, personnel: ['Larsen, R', 'Buckwalter'] },
    { section: 'Flying', time: '08:45', details: { model: 'F-16', eventName: 'SENSORS DEMO (SY6130)', briefTime: '08:45', etd: '10:45', eta: '12:15', debriefEnd: '13:15', notes: 'FALSE' }, personnel: ['Juedeman, D', 'Hickernell'] },
    { section: 'Flying', time: '07:00', details: { model: 'C-12', eventName: 'MSN QUAL', briefTime: '07:00', etd: '11:00', eta: '13:00', debriefEnd: '14:00', notes: 'FALSE' }, personnel: ['Ames', 'Major, K'] },
    { section: 'Flying', time: '09:30', details: { model: 'T-38', eventName: 'LOW L/D P/S CHASE', briefTime: '09:30', etd: '11:30', eta: '12:30', debriefEnd: '13:30', notes: 'FALSE' }, personnel: ['Heary', 'Reed, C'] },
    { section: 'Flying', time: '09:30', details: { model: 'T-38', eventName: 'LOW L/D P/S CHASE', briefTime: '09:30', etd: '11:30', eta: '12:30', debriefEnd: '13:30', notes: 'FALSE' }, personnel: ['Vantiger', 'Roberts, J'] },
    { section: 'Flying', time: '13:30', details: { model: 'T-38', eventName: 'MSN QUAL FORM UPG', briefTime: '13:30', etd: '15:30', eta: '16:30', debriefEnd: '17:30', notes: 'FALSE' }, personnel: ['Digiacomo', 'Payne'] },
    { section: 'Flying', time: '09:00', details: { model: 'X-62A', eventName: 'VISTA UPG', briefTime: '09:00', etd: '11:00', eta: '12:30', debriefEnd: '13:30', notes: 'FALSE' }, personnel: ['Gray, W', 'Janjua'] },
    { section: 'Flying', time: '07:00', details: { model: 'EXTRA', eventName: 'QUAL', briefTime: '07:00', etd: '08:00', eta: '09:00', debriefEnd: '11:00', notes: 'FALSE' }, personnel: ['Marshall, R'] },
    { section: 'Ground', time: '15:00', details: { eventName: 'Heavy Acft Sim Evals MIB', startTime: '15:00', endTime: '17:00', notes: null }, personnel: ['Borek'] },
    { section: 'Ground', time: '10:00', details: { eventName: 'CR TC Primer CR A', startTime: '10:00', endTime: '13:00', notes: null }, personnel: ['Peterson, J', 'Duede'] },
    { section: 'Ground', time: '07:30', details: { eventName: 'NASA Meeting', startTime: '07:30', endTime: '09:00', notes: null }, personnel: ['Peterson, J', 'Kemper', 'Duede', 'Ricci'] },
    { section: 'Ground', time: '08:00', details: { eventName: 'PIO SIM (FS Sim A)', startTime: '08:00', endTime: '09:00', notes: null }, personnel: ['McCafferty', 'Toth, E', 'Arnold, C'] },
    { section: 'Ground', time: '09:00', details: { eventName: 'PIO SIM (FS Sim B)', startTime: '09:00', endTime: '10:00', notes: null }, personnel: ['Slaughter, J', 'Ehler, A'] },
    { section: 'NA', time: '14:00', details: { reason: 'Master Scheduling Mtg', startTime: '14:00', endTime: '15:00' }, personnel: ['Vantiger', 'Montes'] },
    { section: 'NA', time: '09:00', details: { reason: 'TPS Staff Mtg', startTime: '09:00', endTime: '10:30' }, personnel: ['Vantiger', 'Karlen', 'Vanhoy'] },
    { section: 'NA', time: '09:00', details: { reason: 'IRC', startTime: '09:00', endTime: '12:30' }, personnel: ['Gotwald'] },
    { section: 'NA', time: '07:00', details: { reason: 'Water Survival', startTime: '07:00', endTime: '12:00' }, personnel: ['Hamidani'] },
    { section: 'NA', time: '13:00', details: { reason: 'MFLC Session', startTime: '13:00', endTime: '14:00' }, personnel: ['Newland, A'] },
  ],
};
