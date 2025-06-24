import { inject, Injectable } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';

import { catchError, map, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  IAsfiRequest,
  aprovedRequest,
  asfiRequestItem,
  AsfiRequestMapper,
} from '../../infrastructure';

interface filterParams {
  limit: number;
  offset: number;
  term: string;
  isAproved?: boolean;
  processType?: string;
  createdAt?: Date;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AsfiRequestService {
  private http = inject(HttpClient);
  private readonly URL = `${environment.apiUrl}/asfi-request`;

  constructor() {}

  create(form: Object, details: asfiRequestItem[]) {
    return this.http
      .post<IAsfiRequest>(this.URL, {
        ...form,
        details,
      })
      .pipe(map((resp) => AsfiRequestMapper.fromResponse(resp)));
  }

  update(id: string, form: Object, details: asfiRequestItem[]) {
    return this.http
      .patch<IAsfiRequest>(`${this.URL}/${id}`, {
        ...form,
        details,
      })
      .pipe(
        map((resp) => AsfiRequestMapper.fromResponse(resp)),
        catchError((error: HttpErrorResponse) => {
          if (error.status === 409 && error.error?.request) {
            const model = AsfiRequestMapper.fromResponse(error.error.request);
            return throwError(
              () =>
                new HttpErrorResponse({
                  ...error,
                  url: error.url ?? undefined,
                  error: {
                    ...error.error,
                    request: model,
                  },
                })
            );
          }

          // Otros errores, se reenvían sin tocar
          return throwError(() => error);
        })
      );
  }

  getRequests({ isAproved, limit, offset, createdAt, ...props }: filterParams) {
    const params = new HttpParams({
      fromObject: {
        limit,
        offset,
        ...(createdAt && { createdAt: createdAt.toString() }),
        ...(typeof isAproved === 'boolean' && { isAproved }),
        ...Object.fromEntries(Object.entries(props).filter(([_, v]) => v)),
      },
    });
    return this.http
      .get<{ requests: IAsfiRequest[]; length: number }>(this.URL, { params })
      .pipe(
        map((resp) => ({
          length: resp.length,
          requests: resp.requests.map((item) =>
            AsfiRequestMapper.fromResponse(item)
          ),
        }))
      );
  }

  searchAprovedCodes(term?: string) {
    const params = new HttpParams({ fromObject: { ...(term && { term }) } });
    return this.http.get<aprovedRequest[]>(`${this.URL}/aproved`, {
      params,
    });
  }
}
