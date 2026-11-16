// Файл: data.js
export async function loadSubjectDatabase(subjectKey) {
  try {
    let module;
    switch (subjectKey) {
      case 'russian':
        module = await import('./db/data_russian_language.js');
        // Object.values(module)[0] вытащит массив, даже если ты назвал его с опечаткой
        return module.data_russian_language || Object.values(module)[0];
      case 'social':
        module = await import('./db/data_social_studies.js');
        return module.data_social_studies || Object.values(module)[0];
      case 'math_profile':
        module = await import('./db/data_math_profile.js');
        return module.data_math_profile || Object.values(module)[0];
      case 'math_basic':
        module = await import('./db/data_math_basic.js');
        return module.data_math_basic || Object.values(module)[0];
      default:
        return [];
    }
  } catch (error) {
    console.error("Критическая ошибка импорта БД:", error);
    // Возвращаем null, чтобы app.js понял, что файл физически не найден
    return null;
  }
}