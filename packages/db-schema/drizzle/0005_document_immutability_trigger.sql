-- Immutable Original (docs/PRINCIPLES.md, принцип 19): "Original document is
-- the source of truth. AI only creates derived data." Оригинальный файл
-- документа (documents.file_url) не должен переписываться никогда — новая
-- версия создаётся как НОВАЯ строка (documents.supersedes_document_id), не
-- обновлением существующей.
--
-- Это единственный триггер в схеме и написан вручную — drizzle-kit не умеет
-- генерировать DDL для триггеров/функций, поэтому этот файл не будет
-- перезаписан или удалён при следующем `drizzle-kit generate`, но и не будет
-- обнаружен автоматически: при ручных изменениях схемы, затрагивающих
-- documents, проверяйте, что этот файл остаётся среди применяемых миграций.
--
-- Область действия — только file_url (сами байты документа). Остальные поля
-- (title, docType, issuedAt) можно редактировать — например, пользователь
-- уточняет название файла — это не нарушает гарантию неизменности оригинала.

CREATE OR REPLACE FUNCTION prevent_document_file_url_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.file_url IS DISTINCT FROM OLD.file_url THEN
    RAISE EXCEPTION 'documents.file_url is immutable (docs/PRINCIPLES.md, принцип 19) — create a new document row with supersedes_document_id instead of updating id=%', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_file_url_immutable
  BEFORE UPDATE ON "documents"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_document_file_url_update();
