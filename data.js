// Файл: data.js
// Диспетчер баз данных: сам вызывает нужный файл при выборе предмета

export async function loadSubjectDatabase(subjectKey) {
  switch (subjectKey) {
    case 'russian': {
      const module = await import('./db/data_russian_language.js');
      return module.data_russian_language;
    }
    case 'social': {
      const module = await import('./db/data_social_studies.js');
      return module.data_social_studies;
    }
    case 'math_profile': {
      const module = await import('./db/data_math_profile.js');
      return module.data_math_profile;
    }
    case 'math_basic': {
      const module = await import('./db/data_math_basic.js');
      return module.data_math_basic;
    }
    default:
      console.error(`Неизвестный ключ предмета: ${subjectKey}`);
      return [];
  }
}