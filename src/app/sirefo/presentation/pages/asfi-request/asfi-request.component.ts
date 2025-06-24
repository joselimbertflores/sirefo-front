import {
  ChangeDetectionStrategy,
  viewChild,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { Popover, PopoverModule } from 'primeng/popover';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';
import { ToolbarModule } from 'primeng/toolbar';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { MenuItem } from 'primeng/api';

import { PdfViewerModule } from 'ng2-pdf-viewer';

import { AsfiRequestService, FileUploadService } from '../../services';
import { AsfiRequest, asfiRequestStatus } from '../../../domain';
import {
  AsfiNoteDisplayComponent,
  DataFormatDialogComponent,
  requestDetail,
  RequestDetailDialogComponent,
} from '../../components';
import { SearchInputComponent } from '../../../../shared';
import { RequestDialogComponent } from './request-dialog/request-dialog.component';

@Component({
  selector: 'app-asfi-request',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DynamicDialogModule,
    DatePickerModule,
    PdfViewerModule,
    PaginatorModule,
    InputIconModule,
    IconFieldModule,
    TooltipModule,
    ToolbarModule,
    DialogModule,
    ButtonModule,
    TableModule,
    TagModule,
    MenuModule,
    PopoverModule,
    SelectModule,
    SearchInputComponent,
    AsfiNoteDisplayComponent,
    DataFormatDialogComponent
  ],
  templateUrl: './asfi-request.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AsfiRequestComponent implements OnInit {
  private asfiRequestService = inject(AsfiRequestService);
  private dialogService = inject(DialogService);
  private formBuilder = inject(FormBuilder);
  private fileService = inject(FileUploadService);

  popoverRef = viewChild.required<Popover>('op');
  datasource = signal<AsfiRequest[]>([]);
  datasize = signal<number>(0);

  limit = signal<number>(10);
  index = signal<number>(0);
  offset = computed<number>(() => this.limit() * this.index());
  term = signal<string>('');

  isShowingFile = signal(false);
  selectedItem = signal<AsfiRequest | null>(null);

  menuOptions = signal<MenuItem[]>([]);

  readonly PROCESS_TYPES = [
    { value: 'R', label: 'Retencion' },
    { value: 'S', label: 'Suspension' },
  ];

  readonly STATUS = [
    { value: asfiRequestStatus.accepted, label: 'Procesado' },
    { value: asfiRequestStatus.draft, label: 'Registrado' },
    { value: asfiRequestStatus.rejected, label: 'Rechazado' },
    { value: asfiRequestStatus.sent, label: 'Enviado' },
  ];

  filterForm: FormGroup = this.formBuilder.group({
    createdAt: [''],
    processType: [''],
    status: [''],
  });

   isInfoDialogShowing = signal(false);

  ngOnInit(): void {
    this.getData();
  }

  search(term: string) {
    this.term.set(term);
    this.index.set(0);
    this.getData();
  }

  filter() {
    this.index.set(0);
    this.popoverRef().hide();
    this.getData();
  }

  resetFilter() {
    this.filterForm.reset();
    this.filter();
  }

  onPageChange({ rows = 10, page = 0 }: PaginatorState) {
    this.limit.set(rows);
    this.index.set(page);
    this.getData();
  }

  create() {
    const ref = this.dialogService.open(RequestDialogComponent, {
      header: 'Crear Solicitud',
      maximizable: true,
      modal: true,
      width: '50vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    });
    ref.onClose.subscribe((item: AsfiRequest) => {
      if (!item) return;
      this.datasource.update((values) =>
        [item, ...values].slice(0, this.limit())
      );
      this.datasize.update((value) => (value += 1));
    });
  }

  update(item: AsfiRequest) {
    const ref = this.dialogService.open(RequestDialogComponent, {
      header: 'Editar Solicitud',
      maximizable: true,
      modal: true,
      width: '50vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
      data: item,
    });
    ref.onClose.subscribe((result: AsfiRequest | undefined) => {
      if (!result) return;
      this.datasource.update((values) => {
        const index = values.findIndex(({ id }) => id === result.id);
        if (index === -1) return values;
        values[index] = result;
        return [...values];
      });
    });
  }

  showDetail(item: AsfiRequest) {
    const data: requestDetail = {
      requestId: item.requestId,
      requestCode: item.requestCode,
      processType: item.processType,
      createdAt: item.createdAt,
    };
    this.dialogService.open(RequestDetailDialogComponent, {
      header: 'Detalle Solicitud',
      data: data,
      modal: true,
      width: '50vw',
      focusOnShow: false,
      closable: true,
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    });
  }

  showFile(item: AsfiRequest) {
    this.selectedItem.set(item);
    this.isShowingFile.set(true);
  }

  onShowOptionsMenu(request: AsfiRequest): void {
    this.menuOptions.set([
      {
        label: 'Opciones',
        items: [
          {
            icon: 'pi pi-pencil',
            label: 'Editar solicitud',
            disabled: request.status === 'accepted' || request.status === 'sent',
            command: () => {
              this.update(request);
            },
          },
          {
            icon: 'pi pi-info-circle',
            label: 'Detalle solicitud',
            command: () => {
              this.showDetail(request);
            },
          },
          {
            icon: 'pi pi-download',
            label: 'Descargar datos',
            command: () => {
              this.downloadFile(request);
            },
          },
        ],
      },
    ]);
  }

  get isFilterFormValid() {
    return Object.values(this.filterForm.value).some((value) => value);
  }

  private getData() {
    this.asfiRequestService
      .getRequests({
        limit: this.limit(),
        offset: this.offset(),
        term: this.term(),
        ...this.filterForm.value,
      })
      .subscribe((data) => {
        this.datasource.set(data.requests);
        this.datasize.set(data.length);
      });
  }

  private downloadFile(item: AsfiRequest) {
    const fileExtension = item.dataSheetFile.split('.').pop();
    const fileName =
      `solicitud_${item.processTypeLabel}_${item.requestCode}.${fileExtension}`.toLocaleLowerCase();
    this.fileService.downloadFileFromUrl(item.dataSheetFile, fileName);
  }
}
