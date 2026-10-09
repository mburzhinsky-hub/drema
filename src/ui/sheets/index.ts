import { TemplateResult } from 'lit-html';
import { Sheet } from '../../app/ui';
import { childSheet } from './child';
import { entrySheet } from './entry';
import { confirmSheet, inviteSheet, loginSheet, memberSheet, moreSheet, profileSheet, remindersSheet, shareReportSheet } from './misc';
import { sleepEditSheet } from './sleep';
import { voiceSheet } from './voice';

export function sheetView(s: Sheet): TemplateResult {
  switch (s.kind) {
    case 'entry':
      return entrySheet(s);
    case 'sleep-edit':
      return sleepEditSheet(s);
    case 'child':
      return childSheet(s);
    case 'voice':
      return voiceSheet(s);
    case 'confirm':
      return confirmSheet(s);
    case 'member':
      return memberSheet(s);
    case 'more':
      return moreSheet();
    case 'reminders':
      return remindersSheet();
    case 'share-report':
      return shareReportSheet();
    case 'invite':
      return inviteSheet();
    case 'profile':
      return profileSheet();
    case 'login':
      return loginSheet(s);
  }
}
