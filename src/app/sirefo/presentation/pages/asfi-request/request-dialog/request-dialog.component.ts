import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FileSelectEvent, FileUploadModule } from 'primeng/fileupload';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputGroupModule } from 'primeng/inputgroup';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabel } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { ToolbarModule } from 'primeng/toolbar';
import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';

import { catchError, forkJoin, of, switchMap } from 'rxjs';

import {
  ExcelService,
  AsfiRequestService,
  FileUploadService,
} from '../../../services';
import { asfiRequestItem } from '../../../../infrastructure';
import {
  FieldValidationErrorMessages,
  FormErrorMessagesPipe,
  AlertService,
} from '../../../../../shared';
import { AuthService } from '../../../../../auth/presentation/services/auth.service';
import { DataFormatDialogComponent } from '../../../components';
import { CustomFormValidators } from '../../../../../helpers';
import { AsfiRequest } from '../../../../domain';

interface column {
  header: string;
  columnDef: keyof asfiRequestItem;
  width?: string;
}

@Component({
  selector: 'app-request-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputGroupAddonModule,
    InputNumberModule,
    InputGroupModule,
    FileUploadModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    StepperModule,
    ToolbarModule,
    MessageModule,
    TooltipModule,
    ButtonModule,
    SelectModule,
    DialogModule,
    TableModule,
    FloatLabel,
    ToastModule,
    FormErrorMessagesPipe,
    DataFormatDialogComponent,
  ],
  templateUrl: './request-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class RequestDialogComponent implements OnInit {
  private formBuilder = inject(FormBuilder);
  private excelService = inject(ExcelService);
  private dialogRef = inject(DynamicDialogRef);
  private alertService = inject(AlertService);
  private asfiRequestService = inject(AsfiRequestService);
  private fileUploadService = inject(FileUploadService);
  private messageService = inject(MessageService);

  private user = inject(AuthService).user();

  data: AsfiRequest | undefined = inject(DynamicDialogConfig).data;

  readonly YEAR = new Date().getFullYear();
  readonly COLUMNS: column[] = [
    { header: 'Item', columnDef: 'item', width: '40px' },
    { header: 'Nombres', columnDef: 'firstName', width: '15rem' },
    { header: 'Apellido Paterno', columnDef: 'paternalLastName' },
    { header: 'Apellido Materno', columnDef: 'maternalLastName' },
    { header: 'Tipo Documento', columnDef: 'documentType' },
    { header: 'Numero Documento', columnDef: 'documentNumber' },
    { header: 'Complemento', columnDef: 'complement' },
    { header: 'Extension', columnDef: 'extension', width: '100px' },
    { header: 'Auto Conclusion', columnDef: 'autoConclusion' },
    { header: 'Documento Respaldo', columnDef: 'supportDocument' },
    { header: 'Razon Social', columnDef: 'businessName' },
    { header: 'Monto', columnDef: 'amount' },
    { header: 'Tipo Respaldo', columnDef: 'supportType' },
  ];

  readonly PROCESS_TYPES = [
    { value: 'R', label: 'Retención' },
    { value: 'S', label: 'Suspensión' },
  ];

  form = this.formBuilder.nonNullable.group({
    requestingAuthority: [
      this.user?.fullName,
      [
        Validators.required,
        Validators.minLength(5),
        Validators.pattern(/^[A-Za-zÁÉÍÓÚÑáéíóúñ' -]+$/),
        CustomFormValidators.minWordsValidator(2),
      ],
    ],
    authorityPosition: [
      this.user?.position,
      [
        Validators.required,
        Validators.minLength(4),
        Validators.pattern(/^[A-Za-zÁÉÍÓÚÑáéíóúñ.\- ]+$/),
      ],
    ],
    requestCode: [
      '',
      [Validators.required, Validators.min(1), Validators.max(99999)],
    ],
    department: ['ADMINISTRACION TRIBUTARIA MINICIPAL DE SACABA', Validators.required],
    processType: ['', Validators.required],
  });

  protected formMessages: FieldValidationErrorMessages = {
    requestingAuthority: {
      pattern: 'Solo letras, espacios y guiones, sin caracteres especiales',
      minWords: 'Se requieren al menos 2 palabras',
    },
    authorityPosition: {
      pattern: 'Solo letras, espacios y guiones, sin caracteres especiales',
    },
  };

  datasource = signal<asfiRequestItem[]>([]);
  errorMessages = signal<string[]>([]);

  pdfFile = signal<File | null>(null);
  pdfFileName = signal<string | null>(null);

  spreadsheetFile = signal<File | null>(null);

  isDatasourceLoading = signal(false);

  isErrorDialogShowing = signal(false);
  isInfoDialogShowing = signal(false);

  ngOnInit(): void {
    this.loadFormData();
  }

  save() {
    if (!this.isFormValid) return;
    const subscription = this.buildSaveMethod();
    subscription.subscribe({
      next: (asfiRequest) => {
        this.dialogRef.close(asfiRequest);
      },
      error: (error) => {
        if (error instanceof HttpErrorResponse) {
          this.handleHtttErrrors(error);
        }
      },
    });
  }

  onPdfSelect(event: FileSelectEvent) {
    const [file] = event.files;
    if (file && file.type !== 'application/pdf') return;
    this.pdfFile.set(file);
    this.pdfFileName.set(file.name);
  }

  onSpreadSheetSelect(event: FileSelectEvent) {
    const [file] = event.files;
    if (!file) return;
    this.spreadsheetFile.set(file);
    const colums = this.COLUMNS.map(({ header }) => header);
    this.excelService.readExcelFile(file, colums).subscribe({
      next: (data) => {
        this.datasource.set(this.excelDataToDto(data));
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Formato incorrecto',
          detail: 'No se puedo cargar el archivo',
        });
      },
    });
  }

  close() {
    this.dialogRef.close();
  }

  get isFormValid() {
    return this.data
      ? this.form.valid && this.datasource().length > 0
      : this.form.valid &&
          this.datasource().length > 0 &&
          this.pdfFile() &&
          this.spreadsheetFile();
  }

  private handleHtttErrrors(error: HttpErrorResponse) {
    const { message } = error.error;
    switch (error.status) {
      case 409:
        const request = error.error['request'];
        this.alertService.message({
          header: 'Error al registrar la solicitud',
          description:
            typeof message === 'string' ? message : 'La solicitud es invalida',
        });
        this.dialogRef.close(request);
        break;
      case 400:
        if (Array.isArray(message)) {
          this.errorMessages.set(this.parseValidationErrors(message));
          this.isErrorDialogShowing.set(true);
        }
        break;

      default:
        break;
    }
  }

  private loadFormData() {
    if (!this.data) return;

    const { file, dataSheetFile, requestCode, ...props } = this.data;

    this.form.patchValue({
      ...props,
      requestCode: this.data.extractCorrelative().toString(),
    });

    this.pdfFileName.set(file.originalName);

    this.fileUploadService
      .getFile(dataSheetFile)
      .pipe(
        switchMap((file) => this.excelService.readExcelFile(file)),
        catchError(() => of([]))
      )
      .subscribe((data) => {
        this.datasource.set(this.excelDataToDto(data));
      });
  }

  private excelDataToDto(data: any[]): asfiRequestItem[] {
    return data.map((el) => ({
      item: el.Item.toString(),
      maternalLastName: el['Apellido Materno'],
      paternalLastName: el['Apellido Paterno'],
      autoConclusion: el['Auto Conclusion'],
      complement: el["Complemento"],
      extension: el['Extension'],
      documentNumber: el['Numero Documento'],
      documentType: el['Tipo Documento'],
      supportDocument: el['Documento Respaldo'],
      amount: el['Monto'],
      firstName: el['Nombres'],
      businessName: el['Razon Social'],
      supportType: el['Tipo Respaldo'],
    }));
  }

  private buildSaveMethod() {
    return forkJoin([
      this.pdfFile()
        ? this.fileUploadService.uploadAsfiFile(this.pdfFile()!)
        : of(null),
      this.spreadsheetFile()
        ? this.fileUploadService.uploadAsfiFile(this.spreadsheetFile()!)
        : of(null),
    ]).pipe(
      switchMap(([file, dataSheetFile]) => {
        const formData = {
          ...this.form.value,
          ...(file && { file }),
          ...(dataSheetFile && { dataSheetFile: dataSheetFile.fileName }),
        };

        return this.data
          ? this.asfiRequestService.update(
              this.data.id,
              formData,
              this.datasource()
            )
          : this.asfiRequestService.create(formData, this.datasource());
      })
    );
  }

  private parseValidationErrors(errors: string[]): string[] {
    return errors.map((item) => {
      const parts = item.split('.', 3);
      if (parts.length <= 2) return parts.join('.');
      const index = parseInt(parts[1], 10);
      const mensaje = parts.slice(2).join('.');
      return `Fila ${index + 1}: ${mensaje.trim()}`;
    });
  }
}
