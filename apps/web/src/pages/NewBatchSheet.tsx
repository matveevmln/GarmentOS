import { useNavigate } from "react-router-dom";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "../design-system/Drawer/Drawer";
import { NewBatchWizardPage } from "./NewBatchWizardPage";

export function NewBatchSheet() {
  const navigate = useNavigate();
  const close = () => void navigate(-1);
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      repositionInputs={false}
    >
      <DrawerContent className="seller-wizard-sheet">
        <DrawerTitle className="sr-only">Создать новую партию</DrawerTitle>
        <DrawerDescription className="sr-only">
          Выберите модель, количество, цену и срок. Ввод сохраняется при закрытии.
        </DrawerDescription>
        <NewBatchWizardPage onClose={close} />
      </DrawerContent>
    </Drawer>
  );
}
