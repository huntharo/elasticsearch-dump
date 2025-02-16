const should = require('should')
const { s3: S3Client } = require('../../lib/transports/s3')
const utils = require('../utils')
const EventEmitter = require('events')
const zlib = require('zlib')

describe('S3 Transport', function () {
  let transport
  let mockParent
  let mockS3
  const BUCKET = 'test-bucket'
  const FILE = 'test-file.json'

  before(done => {
    mockS3 = new (require('mock-s3')).S3()
    utils.before(mockS3, BUCKET, [FILE], done)
  })

  after(done => {
    utils.after(mockS3, BUCKET, [FILE], done)
  })

  beforeEach(function () {
    mockParent = {
      options: {
        s3Compress: false,
        s3ServerSideEncryption: 'AES256',
        s3Options: {}
      },
      emit: () => {}
    }
    transport = new S3Client(mockParent, `s3://${BUCKET}/${FILE}`, {})
    transport._s3 = mockS3
  })

  describe('upload and download', function () {
    it('should upload file and verify contents', function (done) {
      const testData = [
        { id: 1, name: 'test1' },
        { id: 2, name: 'test2' }
      ]

      // Create EventEmitter for logging
      const emitter = new EventEmitter()
      mockParent.emit = (event, message) => emitter.emit(event, message)

      // Listen for upload completion
      emitter.on('log', (message) => {
        if (message.includes(`Uploaded ${FILE}`)) {
          utils.getObject(mockS3, BUCKET, FILE).then(data => {
            should.exist(data)

            const content = utils.convertJsonLinesToArray(data.Body.toString())
            content.should.be.an.Array()
            content.should.have.length(2)
            content[0].should.deepEqual({ id: 1, name: 'test1' })
            content[1].should.deepEqual({ id: 2, name: 'test2' })
            done()
          }).catch(done)
        }
      })

      transport.set(testData, 0, 0, (err, count) => {
        should.not.exist(err)
        count.should.equal(2)
        transport.set([], 0, 0, (err) => {
          should.not.exist(err)
        })
      })
    })

    it('should handle compressed upload and download', function (done) {
      mockParent.options.s3Compress = true
      const testData = [{ id: 1, compressed: true }]

      // Create EventEmitter for logging
      const emitter = new EventEmitter()
      mockParent.emit = (event, message) => emitter.emit(event, message)

      // Listen for upload completion
      emitter.on('log', (message) => {
        if (message.includes(`Uploaded ${FILE}`)) {
          utils.getObject(mockS3, BUCKET, FILE).then(data => {
            should.exist(data)

            zlib.gunzip(data.Body, (err, unzipped) => {
              should.not.exist(err)
              const content = utils.convertJsonLinesToArray(unzipped.toString())
              content.should.be.an.Array()
              content[0].should.deepEqual({ id: 1, compressed: true })
              done()
            })
          }).catch(done)
        }
      })

      transport.set(testData, 0, 0, (err, count) => {
        should.not.exist(err)
        count.should.equal(1)
        transport.set([], 0, 0, (err) => {
          should.not.exist(err)
        })
      })
    })
  })
})
