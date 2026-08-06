import type { PtBRKey } from './pt-BR';

/** English — same keys as pt-BR. */
export const en: Record<PtBRKey, string> = {
  'tabs.contacts': 'Contacts',
  'tabs.agenda': 'Agenda',
  'tabs.settings': 'Settings',
  'tabs.settingsHeader': 'SeCretina',

  'stack.contact': 'Contact',
  'stack.newContact': 'New contact',
  'stack.editContact': 'Edit contact',
  'stack.postCall': 'Post-call',
  'web.banner':
    'Web preview. On your phone, use the installed SeCretina app.',

  'onboarding.title': 'Set up SeCretina',
  'onboarding.lead':
    'First choose the assistant language; then each permission and why we need it. Allow one by one — the app opens when everything is ready.',
  'onboarding.progress': '{granted} of {total} ready · {current}/{total}',
  'onboarding.slide.language.title': 'SeCretina language',
  'onboarding.slide.language.why':
    'Choose the language the assistant speaks and you reply in by voice. App text switches to this language.',
  'onboarding.slide.mic.title': 'Microphone',
  'onboarding.slide.mic.why':
    'We need the microphone for the wake phrase (“Hello…”), voice notes, and assistant commands.',
  'onboarding.slide.notifications.title': 'Notifications',
  'onboarding.slide.notifications.why':
    'We use notifications to remind you of scheduled calls and when a note is ready.',
  'onboarding.slide.phone.title': 'Phone and call log',
  'onboarding.slide.phone.why':
    'Detects when a call starts or ends and helps identify the number to open the right contact note.',
  'onboarding.slide.contacts.title': 'Contacts',
  'onboarding.slide.contacts.why':
    'Import and recognize names and phones so the assistant knows who a note or appointment is for.',
  'onboarding.slide.calendar.title': 'Calendar',
  'onboarding.slide.calendar.why':
    'Shows device events next to SeCretina’s agenda and aligned reminders.',
  'onboarding.slide.battery.title': 'Unrestricted battery',
  'onboarding.slide.battery.why':
    'On Samsung and other Android devices, battery savers can kill call detection. Unrestricted keeps SeCretina running in the background.',
  'onboarding.status.ok': 'Allowed ✓',
  'onboarding.status.pending': 'Pending — tap Allow',
  'onboarding.cta.continueLanguage': 'Continue with this language',
  'onboarding.cta.next': 'Next',
  'onboarding.cta.finish': 'Done',
  'onboarding.cta.allow': 'Allow {title}',
  'onboarding.cta.wait': 'Please wait…',
  'onboarding.cta.openSettings': 'Open Android settings',
  'onboarding.footer.language': 'You can change the language later in Settings.',
  'onboarding.footer.permission':
    'If Android says “Don’t allow”, use “Open settings” and enable it manually.',
  'onboarding.error.read': 'Could not read permissions. Swipe and tap Allow.',
  'onboarding.error.saveLanguage': 'Could not save the language.',
  'onboarding.error.request': 'Failed to request permission.',

  'contacts.search.placeholder': 'Search contact, note or transcript…',
  'contacts.search.hintMin': 'Type at least 2 letters to search.',
  'contacts.search.hintActive': 'Searching names, notes and transcripts.',
  'contacts.section.contacts': 'Contacts',
  'contacts.section.notes': 'In notes and transcripts',
  'contacts.action.new': '+ New',
  'contacts.action.import': 'Import',
  'contacts.action.talk': 'Talk to SeCretina',
  'contacts.wake.listening': 'Listening for “Hello {name}”…',
  'contacts.wake.active': '“Hello {name}” active — say the name to open.',
  'contacts.wake.disabled': 'Enable wake word in Settings to talk hands-free.',
  'contacts.empty.search': 'No results for this search.',
  'contacts.empty.default': 'No contacts. Tap + New or Import.',
  'contacts.note.transcription': '· transcript',
  'contacts.alert.webTitle': 'Phone only',
  'contacts.alert.webBody': 'Contact import works in the Android app.',
  'contacts.alert.importTitle': 'Import',
  'contacts.alert.importCount': '{count} contact(s) imported.',
  'contacts.alert.importError': 'Could not import.',

  'agenda.filter.upcoming': '2 years',
  'agenda.filter.day': 'Day',
  'agenda.filter.month': 'Month',
  'agenda.filter.week': 'Week',
  'agenda.filter.next7': '7 days',
  'agenda.search.placeholder': 'Search agenda…',
  'agenda.search.hint': 'Name, note or date.',
  'agenda.search.clear': 'Clear',
  'agenda.empty.search': 'Nothing found for this search.',
  'agenda.empty.period': 'No appointments in this period.',
  'agenda.empty.hint': 'Use SeCretina or a contact card to schedule.',
  'agenda.section.overdue': 'Overdue — reschedule or complete',
  'agenda.section.inPeriod': 'In this period',
  'agenda.cta.view': 'View agenda',

  'settings.about.title': 'About SeCretina',
  'settings.about.body':
    'Simple CRM: after each call, it identifies the contact and opens a note. Use voice wake or “Talk to SeCretina”.',
  'settings.voice.title': 'SeCretina voice',
  'settings.voice.body':
    'Choose the assistant’s voice. Natural speech and interpretation use the app server.',
  'settings.voice.timbre': 'Voice timbre',
  'settings.voice.female': 'Female (Coral)',
  'settings.voice.male': 'Male (Ash)',
  'settings.voice.test': 'Test voice',
  'settings.voice.alertTitle': 'Voice',
  'settings.voice.alertNoPlay':
    'Playback not heard. Check internet and phone volume.',
  'settings.language.title': 'Language',
  'settings.language.body':
    'Interface, voice and commands language. Contact names and saved notes do not change.',
  'settings.language.saved': 'Language updated.',

  'assistant.title': 'Talk to SeCretina',
  'assistant.subtitle':
    'Say “Hello {name}” or use the button.\nE.g. “what do I have tomorrow”, “cancel the one with Maria”, “schedule Ana tomorrow at 3”',
  'assistant.phase.speaking': 'Speaking…',
  'assistant.phase.processing': 'Processing…',
  'assistant.listening.command': 'Mic on — say your command now',
  'assistant.listening.pick': 'Mic on — say the number or last name',
  'assistant.listening.yesNo': 'Yes / No / Sí…',
  'assistant.listening.dictate': 'Mic on — dictate the appointment note',
  'assistant.label.note': 'Note',
  'assistant.label.scheduleNote': 'Appointment note',
  'assistant.label.askScheduleNote':
    'Would you like to add a note to this appointment?',
  'assistant.label.typed': 'Or type / confirm the command',
  'assistant.label.pickContact': 'Pick the contact — say the number or tap',
  'assistant.savedInAgenda': 'Saved to the app Agenda.',
  'assistant.cta.stop': 'Stop and run',
  'assistant.cta.speakNow': 'Speak now',
  'assistant.cta.wait': 'Please wait…',
  'assistant.cta.runText': 'Run text',
  'assistant.cta.close': 'Close',
  'assistant.cta.viewAgenda': 'View agenda',
  'assistant.cta.openContact': 'Open {name}',
  'assistant.cta.dictateNote': 'Dictate appointment note',
  'assistant.placeholder.command': 'schedule Paulo Silva tomorrow at 3…',
  'assistant.unnamed': 'No name',
  'assistant.webOnly.title': 'Phone only',
  'assistant.webOnly.body':
    'SeCretina speech recognition works in the Android app.',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.error': 'Error',
  'common.ok': 'OK',
};
