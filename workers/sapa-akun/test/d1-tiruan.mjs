// D1 tiruan untuk tes: node:sqlite (bawaan Node, tanpa dependensi npm) dengan bentuk API D1 yang dipakai Worker:
// prepare(sql).bind(...).first() / .all() / .run(), dan batch([...]) yang atomik (satu transaksi; galat
// membatalkan seluruh batch, seperti D1).
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Pernyataan {
  constructor(db, sql, nilai = []) {
    this.db = db;
    this.sql = sql;
    this.nilai = nilai;
  }

  bind(...nilai) {
    return new Pernyataan(this.db, this.sql, nilai);
  }

  _siap() {
    return this.db.sqlite.prepare(this.sql);
  }

  async first() {
    this.db.dipakai += 1;
    return this._siap().get(...this.nilai) ?? null;
  }

  async all() {
    this.db.dipakai += 1;
    return { results: this._siap().all(...this.nilai), meta: {} };
  }

  async run() {
    this.db.dipakai += 1;
    return this._jalankan();
  }

  _jalankan() {
    const hasil = this._siap().run(...this.nilai);
    return { results: [], meta: { changes: Number(hasil.changes) } };
  }
}

export class D1Tiruan {
  constructor(migrasi) {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(migrasi, 'utf8'));
    this.dipakai = 0;
  }

  prepare(sql) {
    return new Pernyataan(this, sql);
  }

  async batch(daftar) {
    this.dipakai += 1;
    this.sqlite.exec('BEGIN');
    try {
      const hasil = daftar.map((p) => p._jalankan());
      this.sqlite.exec('COMMIT');
      return hasil;
    } catch (galat) {
      this.sqlite.exec('ROLLBACK');
      throw galat;
    }
  }

  baris(sql, ...nilai) {
    return this.sqlite.prepare(sql).all(...nilai);
  }
}
